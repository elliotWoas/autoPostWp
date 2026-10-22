import WooCommercePackage from '@woocommerce/woocommerce-rest-api';
import { logger } from '../utils/logger.js';

// Resolve CJS / ESM nested export from @woocommerce/woocommerce-rest-api
const WooCommerceRestApi = WooCommercePackage.default?.default || WooCommercePackage.default || WooCommercePackage;

export class KianSmartClient {
  /**
   * @param {Object} options
   * @param {string} [options.url]
   * @param {string} [options.consumerKey]
   * @param {string} [options.consumerSecret]
   * @param {Object} [options.apiClient] Optional pre-configured client (for testing/mocking)
   */
  constructor(options = {}) {
    this.url = options.url || process.env.WOOCOMMERCE_URL;
    this.consumerKey = options.consumerKey || process.env.WOOCOMMERCE_CONSUMER_KEY;
    this.consumerSecret = options.consumerSecret || process.env.WOOCOMMERCE_CONSUMER_SECRET;
    this.timeout = options.timeout || 30000;

    if (options.apiClient) {
      this.api = options.apiClient;
    } else {
      if (!this.url || !this.consumerKey || !this.consumerSecret) {
        throw new Error('Missing WooCommerce configuration. Please ensure WOOCOMMERCE_URL, WOOCOMMERCE_CONSUMER_KEY, and WOOCOMMERCE_CONSUMER_SECRET are set in your environment.');
      }

      this.api = new WooCommerceRestApi({
        url: this.url,
        consumerKey: this.consumerKey,
        consumerSecret: this.consumerSecret,
        version: 'wc/v3',
        queryStringAuth: true,
        timeout: this.timeout,
      });
    }
  }

  /**
   * Fetch all out-of-stock products and variations from KianSmart (read-only)
   * @param {Object} [options]
   * @param {number} [options.perPage=100] Products per page (WooCommerce max is 100)
   * @param {number} [options.maxPages] Optional limit on pages to fetch (useful for quick checks)
   * @param {boolean} [options.includeVariations=true] Whether to inspect variations of variable products
   * @returns {Promise<{ items: Array, unmatchedRecords: Array, totalFetched: number, stats: Object }>}
   */
  async fetchOutOfStockProducts({ perPage = 100, maxPages = null, includeVariations = true } = {}) {
    logger.info('KianSmart', `Starting retrieval of out-of-stock products (per_page: ${perPage})...`);

    const items = [];
    const unmatchedRecords = [];
    let page = 1;
    let totalPages = 1;
    let totalOutOfStockSimple = 0;
    let totalVariableProducts = 0;
    let totalVariationOutOfStock = 0;

    try {
      while (true) {
        if (maxPages && page > maxPages) {
          logger.info('KianSmart', `Reached configured maxPages limit (${maxPages}).`);
          break;
        }

        logger.info('KianSmart', `Fetching page ${page}${totalPages > 1 ? ` of ${totalPages}` : ''}...`);

        let response;
        try {
          response = await this.api.get('products', {
            stock_status: 'outofstock',
            status: 'publish', // also can include draft if needed, but publish is primary
            per_page: perPage,
            page: page,
          });
        } catch (requestError) {
          this._handleApiError(requestError, `fetching products page ${page}`);
        }

        const products = response.data || [];
        if (!Array.isArray(products) || products.length === 0) {
          logger.info('KianSmart', `No more products found on page ${page}. Finished.`);
          break;
        }

        // Parse headers for total pages if available
        if (response.headers) {
          const headerPages = parseInt(response.headers['x-wp-totalpages'], 10);
          if (!isNaN(headerPages) && headerPages > 0) {
            totalPages = headerPages;
          }
        }

        for (const product of products) {
          const isVariable = product.type === 'variable';

          if (isVariable) {
            totalVariableProducts++;
            if (includeVariations && Array.isArray(product.variations) && product.variations.length > 0) {
              const variations = await this._fetchProductVariations(product);
              for (const v of variations) {
                if (v.stock_status === 'outofstock') {
                  totalVariationOutOfStock++;
                  this._classifyRecord(v, items, unmatchedRecords);
                }
              }
            } else {
              // If not inspecting variations or variations empty, record the parent product
              totalOutOfStockSimple++;
              this._classifyRecord(this._normalizeProduct(product), items, unmatchedRecords);
            }
          } else {
            totalOutOfStockSimple++;
            this._classifyRecord(this._normalizeProduct(product), items, unmatchedRecords);
          }
        }

        if (products.length < perPage || page >= totalPages) {
          break;
        }

        page++;
      }

      logger.info('KianSmart', `Retrieval complete. Found ${items.length} matched out-of-stock items, ${unmatchedRecords.length} records without SKU.`);

      return {
        items,
        unmatchedRecords,
        totalFetched: items.length + unmatchedRecords.length,
        stats: {
          totalOutOfStockSimple,
          totalVariableProducts,
          totalVariationOutOfStock,
          validSkuCount: items.length,
          missingSkuCount: unmatchedRecords.length,
        }
      };

    } catch (err) {
      logger.error('KianSmart', 'Error while fetching out-of-stock products', err);
      throw err;
    }
  }

  /**
   * Fetch variations for a variable product
   * @private
   */
  async _fetchProductVariations(parentProduct) {
    const variationsList = [];
    try {
      const response = await this.api.get(`products/${parentProduct.id}/variations`, {
        per_page: 100,
      });

      const rawVariations = response.data || [];
      for (const v of rawVariations) {
        const attributeDesc = (v.attributes || []).map(a => a.option).filter(Boolean).join(', ');
        const variationName = attributeDesc 
          ? `${parentProduct.name} (${attributeDesc})` 
          : `${parentProduct.name} - #${v.id}`;

        variationsList.push({
          id: v.id,
          parentId: parentProduct.id,
          name: variationName,
          sku: v.sku ? String(v.sku).trim() : '',
          stock_status: v.stock_status || 'outofstock',
          permalink: v.permalink || parentProduct.permalink || '',
          type: 'variation',
        });
      }
    } catch (err) {
      logger.warn('KianSmart', `Could not fetch variations for product #${parentProduct.id}: ${err.message}`);
    }
    return variationsList;
  }

  /**
   * Normalize WooCommerce product into standard schema
   * @private
   */
  _normalizeProduct(product) {
    return {
      id: product.id,
      parentId: null,
      name: product.name || 'Untitled Product',
      sku: product.sku ? String(product.sku).trim() : '',
      stock_status: product.stock_status || 'outofstock',
      permalink: product.permalink || '',
      type: product.type || 'simple',
    };
  }

  /**
   * Categorize record into items (with SKU) or unmatchedRecords (missing SKU)
   * @private
   */
  _classifyRecord(item, itemsList, unmatchedList) {
    if (item.sku && item.sku.length > 0) {
      itemsList.push(item);
    } else {
      unmatchedList.push({
        id: item.id,
        parentId: item.parentId,
        name: item.name,
        permalink: item.permalink,
        type: item.type,
        reason: 'Missing or empty SKU'
      });
    }
  }

  /**
   * Sanitize and format WooCommerce API errors
   * @private
   */
  _handleApiError(error, contextDescription) {
    if (error.response) {
      const { status, data } = error.response;
      if (status === 401 || status === 403) {
        throw new Error(`WooCommerce authentication failed (${status}) during ${contextDescription}. Please verify your API credentials in .env.`);
      }
      if (status === 404) {
        throw new Error(`WooCommerce API endpoint not found (404) during ${contextDescription}. Check WOOCOMMERCE_URL.`);
      }
      const message = data && data.message ? data.message : JSON.stringify(data || '');
      throw new Error(`WooCommerce API error (${status}) during ${contextDescription}: ${message}`);
    }

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw new Error(`WooCommerce API timeout during ${contextDescription}. Target site took too long to respond.`);
    }

    throw new Error(`WooCommerce network error during ${contextDescription}: ${error.message}`);
  }
}
