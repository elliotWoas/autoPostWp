import WooCommercePackage from '@woocommerce/woocommerce-rest-api';

/**
 * Initialize WooCommerce API client
 * @returns {Object} Configured API client
 */
function initWooCommerceAPI() {
  const url = process.env.WOOCOMMERCE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

  if (!url || !consumerKey || !consumerSecret) {
    throw new Error('Missing WooCommerce configuration. Please check your .env file.');
  }

  // The package exports an object with a nested default property
  const WooCommerceRestApi = WooCommercePackage.default?.default || WooCommercePackage.default || WooCommercePackage;

  return new WooCommerceRestApi({
    url: url,
    consumerKey: consumerKey,
    consumerSecret: consumerSecret,
    version: 'wc/v3',
    queryStringAuth: true, // Use query string authentication for better compatibility
  });
}

/**
 * Get existing category by name (DO NOT CREATE - only find existing)
 * @param {WooCommerceRestApi} wcApi - WooCommerce API client
 * @param {string} categoryName - Category name to find
 * @returns {Promise<number|null>} Category ID or null if not found
 */
async function getExistingCategory(wcApi, categoryName) {
  try {
    // Search for existing category
    const searchResponse = await wcApi.get('products/categories', {
      search: categoryName,
      per_page: 100,
    });

    if (searchResponse.data && searchResponse.data.length > 0) {
      // Check for exact match (case-insensitive)
      const exactMatch = searchResponse.data.find(
        cat => cat.name.toLowerCase() === categoryName.toLowerCase()
      );

      if (exactMatch) {
        console.log(`[Uploader] Found existing category: ${categoryName} (ID: ${exactMatch.id})`);
        return exactMatch.id;
      }
    }

    // Category doesn't exist - return null (don't create)
    console.log(`[Uploader] Category not found (skipping): ${categoryName}`);
    return null;
  } catch (error) {
    console.error(`[Uploader] Error checking category ${categoryName}:`, error.message);
    return null;
  }
}

/**
 * Process categories: only get existing categories (DO NOT CREATE)
 * Limit to first category to avoid timeout
 * @param {WooCommerceRestApi} wcApi - WooCommerce API client
 * @param {Array} categories - Array of category objects with name property
 * @returns {Promise<Array>} Array of category IDs
 */
async function processCategories(wcApi, categories) {
  if (!categories || categories.length === 0) {
    return [];
  }

  const categoryIds = [];

  // Only process first category to avoid timeout
  const firstCategory = categories[0];
  if (firstCategory) {
    const categoryId = await getExistingCategory(wcApi, firstCategory.name);
    if (categoryId) {
      categoryIds.push({ id: categoryId });
    }
  }

  return categoryIds;
}

/**
 * Uploads a product to WooCommerce via REST API
 * @param {Object} productData - Product data object from scraper
 * @returns {Promise<number>} Created product ID
 */
export async function uploadProduct(productData) {
  console.log('[Uploader] Initializing WooCommerce API...');
  const wcApi = initWooCommerceAPI();

  try {
    // All fields are optional - use defaults if missing
    const productName = productData.name || 'Untitled Product';
    const productPrice = productData.regular_price || '0';

    console.log(`[Uploader] Preparing to upload product: ${productName || '(no name)'}`);

    // Process categories: get or create them and get IDs
    let categoryIds = [];
    if (productData.categories && productData.categories.length > 0) {
      console.log(`[Uploader] Processing ${productData.categories.length} categories...`);
      categoryIds = await processCategories(wcApi, productData.categories);
    }

    // Map scraped data to WooCommerce product format
    // Only include fields that have values (WooCommerce handles empty strings differently)
    const wooCommerceProduct = {
      name: productName,
      type: 'simple', // MVP focuses on simple products
      status: 'draft', // Set to 'draft' for safety - change to 'publish' if you want auto-publish
    };

    // Only add price if found (WooCommerce requires price for published products)
    if (productPrice && productPrice !== '0') {
      wooCommerceProduct.regular_price = productPrice;
    }

    // // Add description if found
    // if (productData.description.length > 700) {
    //   console.log('description is too long');

    // }else {
    //   wooCommerceProduct.description = productData.description;
    // }

    if (productData.description.length) {
      if (productData.description.length > 700) {
        console.log('description is too long');
      } else {
        wooCommerceProduct.description = productData.description;
      }
    }

    // Add short description if found
    if (productData.short_description.length > 200) {
      console.log('short description is too long');
    } else {
      wooCommerceProduct.short_description = productData.short_description;
    }

    // Add SKU if found - check for duplicates first
    if (productData.sku) {
      try {
        // Check if SKU already exists
        const existingProducts = await wcApi.get('products', {
          sku: productData.sku,
          per_page: 1,
        });

        if (existingProducts.data && existingProducts.data.length > 0) {
          console.warn(`[Uploader] SKU "${productData.sku}" already exists. Skipping SKU to avoid duplicate.`);
          // Don't add SKU if it already exists - WooCommerce will auto-generate or we can skip it
          // Alternatively, you could append a suffix: wooCommerceProduct.sku = `${productData.sku}-${Date.now()}`;
        } else {
          wooCommerceProduct.sku = productData.sku;
        }
      } catch (error) {
        // If SKU check fails, try to add it anyway (might be a permission issue)
        console.warn(`[Uploader] Could not check SKU existence, adding anyway: ${error.message}`);
        wooCommerceProduct.sku = productData.sku;
      }
    }

    // Add images if found
    if (productData.images && productData.images.length > 0) {
      wooCommerceProduct.images = productData.images;
    }

    // Add categories if found
    if (categoryIds.length > 0) {
      wooCommerceProduct.categories = categoryIds;
    }

    // Add sale_price if available
    if (productData.sale_price) {
      wooCommerceProduct.sale_price = productData.sale_price;
    }

    // Add features as WooCommerce attributes (ویژگی های محصول)
    if (productData.features && productData.features.length > 0) {
      // Clean and prepare all features - NO LIMIT
      const allFeatures = productData.features
        .map(f => f.trim())
        .filter(f => f && f.length > 0)
        .filter((f, index, self) => self.indexOf(f) === index); // Remove duplicates

      console.log(`[Uploader] Processing ${allFeatures.length} product features...`);
      console.log(`[Uploader] First 10 features:`, allFeatures.slice(0, 10).join(' | '));
      if (allFeatures.length > 10) {
        console.log(`[Uploader] ... and ${allFeatures.length - 10} more features`);
      }

      // NEW: Format features for dina_product_fields meta
      const formattedFeatures = allFeatures.map((feature, index) => ({
        ftitle: feature,
        fdesc: '' // Empty description for now
      }));

      // Add dina_product_features meta data
      wooCommerceProduct.meta_data = [
        {
          key: 'dina_product_features',
          value: formattedFeatures
        }
      ];

      console.log(`[Uploader] ✓ Prepared ${formattedFeatures.length} features for dina_product_fields meta`);

      // Convert features to WooCommerce attributes format
      // Create a single attribute "ویژگی های محصول" with ALL features as options - NO LIMIT
      wooCommerceProduct.attributes = [
        {
          id: 0, // 0 means new attribute
          name: 'ویژگی های محصول',
          options: allFeatures, // ALL features - no limit
          visible: true, // Show in Additional Information tab
          variation: false // Not used for variations
        }
      ];

      // Also add features to description as HTML for better display - ALL features
      const featuresHTML = '<h3>ویژگی های محصول:</h3><ul>' +
        allFeatures.map(f => `<li>${f.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('') +
        '</ul>';

      // Prepend features to description (features are most important)
      if (wooCommerceProduct.description) {
        wooCommerceProduct.description = featuresHTML + '<br><br>' + wooCommerceProduct.description;
      } else {
        wooCommerceProduct.description = featuresHTML;
      }

      // Also add to short_description if it's empty or doesn't contain features
      if (!wooCommerceProduct.short_description || !wooCommerceProduct.short_description.includes('ویژگی')) {
        const shortFeatures = allFeatures.slice(0, 5).join('، ');
        if (wooCommerceProduct.short_description) {
          wooCommerceProduct.short_description = shortFeatures + ' - ' + wooCommerceProduct.short_description;
        } else {
          wooCommerceProduct.short_description = shortFeatures;
        }
      }

      console.log(`[Uploader] ✓ Added ALL ${allFeatures.length} product features as WooCommerce attributes and meta data`);
    } else {
      console.warn('[Uploader] ⚠ No features found in product data');
    }

    console.log('[Uploader] Uploading product to WooCommerce...');
    console.log(`[Uploader] Product data:`, {
      name: wooCommerceProduct.name,
      price: wooCommerceProduct.regular_price || '(not set)',
      sale_price: wooCommerceProduct.sale_price || '(not set)',
      images: (wooCommerceProduct.images || []).length,
      categories: categoryIds.length,
      tags: (wooCommerceProduct.tags || []).length,
      sku: wooCommerceProduct.sku || '(not set)',
      attributes: (wooCommerceProduct.attributes || []).length,
      features: productData.features?.length || 0,
      has_dina_meta: !!(wooCommerceProduct.meta_data && wooCommerceProduct.meta_data.length > 0)
    });

    // Create product via API
    let response;
    try {
      response = await wcApi.post('products', wooCommerceProduct);
    } catch (firstError) {
      // If error is due to duplicate SKU, retry without SKU
      if (firstError.response && firstError.response.status === 400) {
        const errorData = firstError.response.data;
        if (errorData && (errorData.code === 'product_invalid_sku' || errorData.message?.includes('SKU'))) {
          console.warn(`[Uploader] SKU conflict detected. Retrying without SKU...`);
          // Remove SKU and retry
          delete wooCommerceProduct.sku;
          try {
            response = await wcApi.post('products', wooCommerceProduct);
            console.log('[Uploader] Product created successfully without SKU');
          } catch (retryError) {
            // If retry also fails, throw the original error
            throw firstError;
          }
        } else {
          throw firstError;
        }
      } else {
        throw firstError;
      }
    }

    if (response.data && response.data.id) {
      const productId = response.data.id;
      console.log(`[Uploader] Product successfully created with ID: ${productId}`);
      console.log(`[Uploader] Product URL: ${response.data.permalink || 'N/A'}`);

      // NEW: Update product meta separately if needed (fallback method)
      if (wooCommerceProduct.meta_data && wooCommerceProduct.meta_data.length > 0) {
        await updateProductMeta(wcApi, productId, wooCommerceProduct.meta_data);
      }

      return productId;
    } else {
      throw new Error('Invalid response from WooCommerce API');
    }

  } catch (error) {
    console.error('[Uploader] Error uploading product:', error.message);

    // Handle specific API errors
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401 || status === 403) {
        throw new Error('WooCommerce authentication failed. Please check your API credentials.');
      } else if (status === 400) {
        const errorMsg = data?.message || JSON.stringify(data);
        throw new Error(`Invalid product data: ${errorMsg}`);
      } else if (status === 404) {
        throw new Error('WooCommerce API endpoint not found. Check your site URL.');
      } else {
        throw new Error(`WooCommerce API error (${status}): ${JSON.stringify(data)}`);
      }
    }

    throw error;
  }
}

/**
 * NEW: Update product meta data separately (fallback method)
 */
async function updateProductMeta(wcApi, productId, metaData) {
  try {
    console.log(`[Uploader] Updating meta data for product ${productId}...`);

    // First, get current product data
    const product = await wcApi.get(`products/${productId}`);
    const currentMeta = product.data.meta_data || [];

    // Merge existing meta with our new meta
    const updatedMeta = [...currentMeta];

    metaData.forEach(newMeta => {
      const existingIndex = updatedMeta.findIndex(m => m.key === newMeta.key);
      if (existingIndex >= 0) {
        updatedMeta[existingIndex] = newMeta;
      } else {
        updatedMeta.push(newMeta);
      }
    });

    // Update product with merged meta data
    await wcApi.put(`products/${productId}`, {
      meta_data: updatedMeta
    });

    console.log(`[Uploader] ✓ Meta data updated successfully for product ${productId}`);
  } catch (error) {
    console.error(`[Uploader] Error updating meta data:`, error.message);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Future extension: Batch upload support
 * Comment for scalability - can be implemented later for uploading multiple products
 * Example: Promise.all(products.map(product => uploadProduct(product)))
 * 
 * Note: WooCommerce API has rate limits, so consider adding delays between requests
 * or using a queue system for large batches.
 */

