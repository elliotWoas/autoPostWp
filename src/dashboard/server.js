import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { KianSmartClient } from '../clients/woocommerce-client.js';
import { TehranJanebiClient } from '../clients/tehranjanebi-client.js';
import { reconcileInventories } from '../core/comparison-engine.js';
import { scrapeProduct } from '../publisher/scraper.js';
import { uploadProduct } from '../publisher/uploader.js';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = parseInt(process.env.DASHBOARD_PORT || process.env.PORT || '3000', 10);
const HOST = process.env.DASHBOARD_HOST || '127.0.0.1'; // Localhost only by default

// Cache last reconciliation in memory
let lastReconciliationResult = null;
let lastCheckTime = null;

/**
 * Read request JSON payload safely
 * @param {http.IncomingMessage} req 
 * @returns {Promise<Object>}
 */
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Protect against payload DOS (10MB limit)
      if (body.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body.trim() ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // CORS headers for local usage
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Route: System Status
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      host: HOST,
      port: PORT,
      lastCheckTime,
      configuredSites: {
        kianSmartUrl: process.env.WOOCOMMERCE_URL || '(not configured)',
        tehranJanebiUrl: process.env.CUSTOM_SITE_BASE_URL || process.env.TEHRANJANEBI_API_BASE_URL || 'https://www.tehranjanebi.com',
        hasKianSmartCredentials: !!(process.env.WOOCOMMERCE_CONSUMER_KEY && process.env.WOOCOMMERCE_CONSUMER_SECRET),
        tehranJanebiMode: process.env.TEHRANJANEBI_SNAPSHOT_FILE ? 'snapshot-file' : 'api',
      },
      lastSummary: lastReconciliationResult ? lastReconciliationResult.summary : null,
    }));
    return;
  }

  // API Route: Trigger Inventory Reconciliation
  if (pathname === '/api/reconcile' && req.method === 'POST') {
    try {
      logger.info('Dashboard', 'Triggering inventory reconciliation from UI...');

      // 1. Initialize Clients
      const kianSmartClient = new KianSmartClient();
      const tehranJanebiClient = new TehranJanebiClient();

      // 2. Fetch out-of-stock products from KianSmart
      logger.info('Dashboard', 'Fetching KianSmart out-of-stock products...');
      const ksResult = await kianSmartClient.fetchOutOfStockProducts();

      // 3. Fetch TehranJanebi wholesale inventory snapshot
      logger.info('Dashboard', 'Fetching TehranJanebi inventory snapshot...');
      const tjResult = await tehranJanebiClient.fetchInventorySnapshot();

      // 4. Run local comparison engine
      logger.info('Dashboard', `Reconciling ${ksResult.items.length} KianSmart items against ${tjResult.products.length} TehranJanebi products...`);
      const report = reconcileInventories({
        kianSmartProducts: ksResult.items,
        tehranJanebiProducts: tjResult.products,
        kianSmartUnmatched: ksResult.unmatchedRecords,
      });

      lastReconciliationResult = report;
      lastCheckTime = report.timestamp;

      logger.info('Dashboard', `Reconciliation successful. Found ${report.summary.opportunitiesCount} restock opportunities.`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: report,
      }));
    } catch (err) {
      logger.error('Dashboard', 'Reconciliation error', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: err.message || 'Unknown server error during inventory reconciliation',
      }));
    }
    return;
  }

  // API Route: Batch Product Publisher
  if (pathname === '/api/publish' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const rawUrls = Array.isArray(payload.urls) ? payload.urls : (payload.url ? [payload.url] : []);
      const urls = rawUrls.map(u => String(u).trim()).filter(u => u.length > 0);

      if (urls.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Please provide at least one product URL to publish.' }));
        return;
      }

      logger.info('PublisherAPI', `Received request to publish ${urls.length} products...`);
      const results = [];
      const baseUrl = process.env.CUSTOM_SITE_BASE_URL || '';

      for (let i = 0; i < urls.length; i++) {
        const productUrl = urls[i];
        logger.info('PublisherAPI', `[${i + 1}/${urls.length}] Scraping & Publishing: ${productUrl}`);

        try {
          // Validate URL format
          new URL(productUrl);

          // Step 1: Scrape product data using existing scraper
          const productData = await scrapeProduct(productUrl, baseUrl);

          // Step 2: Upload product to WooCommerce using existing uploader
          const productId = await uploadProduct(productData);

          results.push({
            url: productUrl,
            status: 'success',
            productId,
            name: productData.name || 'Untitled Product',
            price: productData.regular_price || '(not set)',
            salePrice: productData.sale_price || null,
            sku: productData.sku || '(not set)',
            imagesCount: (productData.images || []).length,
          });
        } catch (itemError) {
          logger.error('PublisherAPI', `Failed to publish product from ${productUrl}`, itemError);
          results.push({
            url: productUrl,
            status: 'error',
            error: itemError.message,
          });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      logger.info('PublisherAPI', `Batch publish finished. ${successCount}/${urls.length} products succeeded.`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        summary: {
          total: urls.length,
          succeeded: successCount,
          failed: urls.length - successCount,
        },
        results,
      }));
    } catch (err) {
      logger.error('PublisherAPI', 'Unexpected publisher error', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: err.message || 'Internal server error while publishing products',
      }));
    }
    return;
  }

  // Static files handling
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check: ensure file is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Access Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log('='.repeat(65));
  console.log('  KianSmart ⇄ TehranJanebi Automation & Reconciliation Dashboard');
  console.log('='.repeat(65));
  console.log(`  Local URL:    http://${HOST}:${PORT}`);
  console.log(`  Environment:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`  WooCommerce:  ${process.env.WOOCOMMERCE_URL || '(check .env)'}`);
  console.log(`  TehranJanebi: ${process.env.CUSTOM_SITE_BASE_URL || 'https://www.tehranjanebi.com'}`);
  console.log('='.repeat(65));
  console.log('  Press Ctrl+C to stop the dashboard server.');
  console.log('='.repeat(65));
});
