import puppeteer from 'puppeteer';
import { scrapeCustomSite } from './scraper-custom.js';
import { scrapeWordPressSite } from './scraper-wordpress.js';

/**
 * User agent to mimic a real browser and avoid detection
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Detects if a site is WordPress/WooCommerce based on page content
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<boolean>} True if WordPress site detected
 */
async function isWordPressSite(page) {
  try {
    const isWP = await page.evaluate(() => {
      // Check for WordPress/WooCommerce indicators
      return !!(
        document.querySelector('.woocommerce, .woocommerce-product, [class*="woocommerce"]') ||
        document.querySelector('link[href*="wp-content"]') ||
        document.querySelector('script[src*="wp-content"]') ||
        document.querySelector('script[src*="woocommerce"]') ||
        document.body.innerHTML.includes('woocommerce') ||
        document.body.innerHTML.includes('wp-content')
      );
    });
    return isWP;
  } catch (error) {
    console.warn('[Scraper] Could not detect site type, defaulting to custom site');
    return false;
  }
}

/**
 * Main scraper function that detects site type and routes to appropriate scraper
 * @param {string} url - The product URL to scrape
 * @param {string} baseUrl - Optional base URL for resolving relative image paths
 * @returns {Promise<Object>} Structured product data object
 */
export async function scrapeProduct(url, baseUrl = '') {
  console.log(`[Scraper] Starting scrape for URL: ${url}`);
  
  let browser = null;
  
  try {
    // Launch Puppeteer with optimized settings
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    };

    // Use custom executable path if provided
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      console.log(`[Scraper] Using custom Chromium path: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(USER_AGENT);
    console.log('[Scraper] Browser launched, navigating to page...');

    // Navigate to the product page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('[Scraper] Page loaded, waiting for content...');

    // Wait a bit for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to wait for any content
    try {
      await page.waitForSelector('body', { timeout: 5000 });
      console.log('[Scraper] Page content loaded');
    } catch (error) {
      console.warn('[Scraper] Warning: Page load timeout, continuing anyway...');
    }

    // Detect site type and route to appropriate scraper
    const isWordPress = await isWordPressSite(page);
    
    let productData;
    if (isWordPress) {
      console.log('[Scraper] WordPress/WooCommerce site detected');
      productData = await scrapeWordPressSite(url, baseUrl, page);
    } else {
      console.log('[Scraper] Custom-coded site detected');
      productData = await scrapeCustomSite(url, baseUrl, page);
    }

    // Log extracted data (all fields are optional)
    console.log('[Scraper] Extraction completed:');
    console.log(`[Scraper] - Name: ${productData.name || '(not found)'}`);
    console.log(`[Scraper] - Price: ${productData.regular_price || '(not found)'}`);
    console.log(`[Scraper] - Sale Price: ${productData.sale_price || '(not found)'}`);
    console.log(`[Scraper] - SKU: ${productData.sku || '(not found)'}`);
    console.log(`[Scraper] - Description: ${productData.description ? 'Found' : '(not found)'}`);
    console.log(`[Scraper] - Short Description: ${productData.short_description ? 'Found (' + productData.short_description.substring(0, 50) + '...)' : '(not found)'}`);
    console.log(`[Scraper] - Images: ${productData.images.length}`);
    console.log(`[Scraper] - Categories: ${productData.categories.length}`);
    console.log(`[Scraper] - Tags: ${productData.tags.length}`);
    console.log(`[Scraper] - Features: ${productData.features?.length || 0} ${productData.features?.length > 0 ? `(${productData.features.slice(0, 3).join(', ')}...)` : ''}`);

    return productData;

  } catch (error) {
    console.error('[Scraper] Error during scraping:', error.message);
    
    if (error.name === 'TimeoutError') {
      throw new Error(`Scraping timeout: The page took too long to load. URL: ${url}`);
    }
    
    throw error;
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
      console.log('[Scraper] Browser closed');
    }
  }
}

/**
 * Future extension: Batch scraping multiple products
 * Comment for scalability - can be implemented later for concurrent scraping
 * Example: Promise.all(urls.map(url => scrapeProduct(url)))
 */
