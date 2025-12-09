import puppeteer from 'puppeteer';

/**
 * User agent to mimic a real browser and avoid detection
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrapes product data from a custom-coded e-commerce site (non-WordPress)
 * Optimized for sites like tehranjanebi.com
 * @param {string} url - The product URL to scrape
 * @param {string} baseUrl - Optional base URL for resolving relative image paths
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} Structured product data object
 */
export async function scrapeCustomSite(url, baseUrl = '', page) {
  console.log(`[Custom Scraper] Extracting data from custom-coded site...`);

  const productData = await page.evaluate((baseUrl) => {
    const data = {
      name: '',
      description: '',
      short_description: '',
      regular_price: '',
      sale_price: '',
      sku: '',
      images: [],
      categories: [],
      tags: [],
      features: [], // Product features/specifications
    };

    // Extract product name - try h1 first, then other selectors
    let nameElement = document.querySelector('h1');
    if (!nameElement) {
      nameElement = document.querySelector('.product-title, .product-name, [class*="title"], [class*="name"]');
    }
    if (nameElement) {
      data.name = nameElement.textContent.trim();
    }

    // Extract regular price - try multiple strategies
    let priceElement = document.querySelector('.price, .product-price, [data-price], [class*="price"]');
    if (priceElement) {
      const priceText = priceElement.textContent.trim();
      const priceMatch = priceText.match(/[\d.,]+/);
      if (priceMatch) {
        data.regular_price = priceMatch[0].replace(/,/g, '');
      }
    }

    // Extract sale price if available
    let salePriceElement = document.querySelector('.sale-price, .price-sale, .discount-price, [class*="sale"]');
    if (salePriceElement) {
      const salePriceText = salePriceElement.textContent.trim();
      const priceMatch = salePriceText.match(/[\d.,]+/);
      if (priceMatch) {
        data.sale_price = priceMatch[0].replace(/,/g, '');
      }
    }

    // Extract description
    let descElement = document.querySelector('.product-description, .product-details, .product-content, .desc-pro, [class*="description"], [class*="details"]');
    if (descElement) {
      data.description = descElement.innerHTML.trim();
    }

    // Extract short description
    let shortDescElement = document.querySelector('.product-excerpt, .product-summary, .short-desc, [class*="excerpt"]');
    if (shortDescElement) {
      data.short_description = shortDescElement.textContent.trim();
    }

    // Extract SKU - for custom sites, try to find product ID
    let skuElement = document.querySelector('[data-sku], [itemprop="sku"], .sku-value, [class*="sku"], [class*="product-id"]');
    if (!skuElement) {
      // Extract from text like "شناسه محصول: 270341"
      const allText = document.body.innerText;
      const productIdMatch = allText.match(/شناسه محصول:\s*(\d+)/i) || allText.match(/product[_\s-]?id[:\s]*(\d+)/i);
      if (productIdMatch) {
        data.sku = productIdMatch[1].trim();
      }
    } else {
      data.sku = skuElement.textContent.trim();
    }

    // Get all text once for multiple uses
    const allText = document.body.innerText || '';


    // Extract product features/specifications
    // Strategy 1: Look for dedicated features sections
    const featureSelectors = [
      '.product-features', '.features', '.specifications', '.specs',
      '[class*="feature"]', '[class*="spec"]', 'ul.product-features', 'ul.features',
      'ul:has(li)', 'ol:has(li)'
    ];

    let featuresList = null;
    for (const selector of featureSelectors) {
      try {
        featuresList = document.querySelector(selector);
        if (featuresList) break;
      } catch (e) {
        continue;
      }
    }
    // If no list found, try explicit desc-pro blocks
    if (!featuresList) {
      featuresList = document.querySelector('.desc-pro');
    }

    // Strategy 2: Extract from text patterns like "ویژگی های محصول:" followed by features
    const featuresMatch = allText.match(/ویژگی[‌\s]*های[‌\s]*محصول[:\s]*([\s\S]*?)(?:\n\n|\n[^\d]|$)/i) ||
      allText.match(/features?[:\s]*([\s\S]*?)(?:\n\n|\n[^\d]|$)/i);

    if (featuresMatch && featuresMatch[1]) {
      const featuresText = featuresMatch[1].trim();
      // Split by newlines, numbers, or bullet points
      const features = featuresText
        .split(/\n|(?=\d+\.)|(?=[•\-\*])/)
        .map(f => f.replace(/^\d+\.?\s*/, '').replace(/^[•\-\*]\s*/, '').trim())
        .filter(f => f.length > 3 && !f.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن)/i));

      if (features.length > 0) {
        data.features = features; // NO LIMIT - get all features
      }
    }

    // Strategy 3: Extract from HTML lists in description or short description
    if (data.features.length === 0) {
      const descHTML = data.description || data.short_description || '';
      if (descHTML) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = descHTML;
        const listItems = tempDiv.querySelectorAll('li, .feature-item, [class*="feature"], dt, dd, p');

        if (listItems.length > 0) {
          listItems.forEach((item) => {
            const featureText = item.textContent.trim();
            if (featureText && featureText.length > 3 &&
              !featureText.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی)/i)) {
              data.features.push(featureText);
            }
          });
        }
      }
    }

    // Strategy 4: Extract from features list element if found
    if (featuresList && data.features.length === 0) {
      const featureItems = featuresList.querySelectorAll('li, .desc-pro, .feature-item, [class*="feature"], dt, dd, p');
      featureItems.forEach((item) => {
        const featureText = item.textContent.trim();
        if (featureText && featureText.length > 3) {
          data.features.push(featureText);
        }
      });
    }


    // Strategy 5: Extract from short_description text if it contains feature-like content
    if (data.features.length === 0 && data.short_description) {
      const shortDescText = data.short_description;
      // Look for numbered or bulleted features
      const lines = shortDescText
        .split(/\n|(?=\d+\.)|(?=[•\-\*])/)
        .map(l => l.replace(/^\d+\.?\s*/, '').replace(/^[•\-\*]\s*/, '').trim())
        .filter(l => l.length > 5 &&
          !l.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی|ویژگی)/i));

      if (lines.length > 0) {
        data.features = lines; // NO LIMIT - get all features
      }
    }

    // Clean up features - remove duplicates and empty items
    data.features = [...new Set(data.features.filter(f => f && f.length > 3))];

    return data;
  }, baseUrl);

  return productData;
}

