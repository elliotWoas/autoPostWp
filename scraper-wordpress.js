import puppeteer from 'puppeteer';

/**
 * Scrapes product data from WordPress/WooCommerce sites
 * Optimized for sites like rezonal.co
 * @param {string} url - The product URL to scrape
 * @param {string} baseUrl - Optional base URL for resolving relative image paths
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} Structured product data object
 */
export async function scrapeWordPressSite(url, baseUrl = '', page) {
  console.log(`[WordPress Scraper] Extracting data from WordPress/WooCommerce site...`);

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

    // Find the main product container to scope all extraction
    let productContainer = document.querySelector('.product, .woocommerce-product, .product-details, .product-summary, .product-info, [class*="product-detail"], [class*="product-main"], .single-product, [itemtype*="Product"]');
    
    if (!productContainer) {
      productContainer = document.querySelector('main, .main-content, .content, [role="main"]') || document.body;
    }

    // Exclude related products sections
    const excludeSelectors = [
      '.related-products', '.related', '.upsells', '.cross-sells', 
      '.products', '.product-list', '.similar-products', '[class*="related"]',
      '[class*="upsell"]', '[class*="cross-sell"]', '[class*="similar"]',
      '.woocommerce-related', '.woocommerce-upsells', '.woocommerce-cross-sells'
    ];
    
    function isInExcludedSection(element) {
      if (!element) return false;
      for (const selector of excludeSelectors) {
        if (element.closest(selector)) {
          return true;
        }
      }
      return false;
    }

    // Extract product name - scoped to product container
    let nameElement = productContainer.querySelector('h1');
    if (!nameElement) {
      nameElement = productContainer.querySelector('.product-title, .product-name, [class*="title"], [class*="name"]');
    }
    if (nameElement && !isInExcludedSection(nameElement)) {
      data.name = nameElement.textContent.trim();
    }

    // Extract regular price - scoped to product container
    // Try multiple strategies for price extraction
    let priceElement = productContainer.querySelector('.price, .woocommerce-Price-amount, .amount, [class*="price"], [data-price], .product-price, .current-price, .price-wrapper, [itemprop="price"], .woocommerce-Price-amount.amount');
    
    // If not found, try to find price by text pattern (e.g., "8,680,000 تومان")
    if (!priceElement) {
      const allPriceElements = productContainer.querySelectorAll('*');
      for (const el of allPriceElements) {
        const text = el.textContent.trim();
        // Look for price pattern with numbers and currency
        if (text.match(/[\d,]+[\s]*تومان/i) || text.match(/[\d,]+[\s]*ریال/i) || text.match(/[\d,]+[\s]*\$|USD/i)) {
          if (!isInExcludedSection(el) && el.children.length === 0) {
            priceElement = el;
            break;
          }
        }
      }
    }
    
    if (priceElement && !isInExcludedSection(priceElement)) {
      const priceText = priceElement.textContent.trim();
      // Extract numeric value - handle Persian numbers and commas
      const priceMatch = priceText.match(/[\d,]+/);
      if (priceMatch) {
        data.regular_price = priceMatch[0].replace(/,/g, '');
      }
    }

    // Extract sale price - scoped to product container
    // Look for del/strikethrough price (common in WooCommerce)
    let salePriceElement = productContainer.querySelector('.sale-price, .price-sale, .discount-price, [class*="sale"], [class*="discount"], del .woocommerce-Price-amount, del .amount, ins .woocommerce-Price-amount');
    
    // Also check if there's a del element with price
    if (!salePriceElement) {
      const delElement = productContainer.querySelector('del .woocommerce-Price-amount, del .amount, del[class*="price"]');
      if (delElement && !isInExcludedSection(delElement)) {
        salePriceElement = delElement;
      }
    }
    
    if (salePriceElement && !isInExcludedSection(salePriceElement)) {
      const salePriceText = salePriceElement.textContent.trim();
      const priceMatch = salePriceText.match(/[\d,]+/);
      if (priceMatch) {
        data.sale_price = priceMatch[0].replace(/,/g, '');
      }
    }

    // Extract description - scoped to product container
    let descElement = productContainer.querySelector('.description, .product-desc, .product-details, [class*="description"], [class*="details"], #description, .woocommerce-product-details__short-description, [itemprop="description"]');
    if (descElement && !isInExcludedSection(descElement) && !descElement.closest('.related, .upsells, .cross-sells')) {
      data.description = descElement.innerHTML.trim();
    }

    // Extract short description - scoped to product container
    let shortDescElement = productContainer.querySelector('.excerpt, .summary, .short-desc, [class*="excerpt"], [class*="summary"], .woocommerce-product-details__short-description');
    if (shortDescElement && !isInExcludedSection(shortDescElement)) {
      // Get both HTML and text - HTML for features extraction, text for short_description
      data.short_description = shortDescElement.innerHTML.trim() || shortDescElement.textContent.trim();
    }

    // Extract SKU - scoped to product container
    let skuElement = productContainer.querySelector('[data-sku], [itemprop="sku"], .sku-value, [class*="sku"], .sku, .product_meta .sku');
    if (skuElement && !isInExcludedSection(skuElement)) {
      data.sku = skuElement.textContent.trim();
    }

    // Extract images - ONLY from main product gallery, exclude related products
    let galleryContainer = productContainer.querySelector('.product-images, .woocommerce-product-gallery, .product-gallery, .product-photos, [class*="gallery"], [class*="images"]');
    if (!galleryContainer) {
      galleryContainer = productContainer;
    }
    
    const imageElements = galleryContainer.querySelectorAll('img');
    imageElements.forEach((img) => {
      if (isInExcludedSection(img)) {
        return;
      }
      
      let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('data-large_image');
      if (src && !src.includes('data:image') && !src.includes('placeholder')) {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        
        if (width > 100 && height > 100 || src.includes('product') || src.includes('woocommerce') || src.includes('wp-content/uploads')) {
          if (src.startsWith('//')) {
            src = 'https:' + src;
          } else if (src.startsWith('/')) {
            const urlObj = new URL(window.location.href);
            src = urlObj.origin + src;
          } else if (!src.startsWith('http')) {
            const urlObj = new URL(window.location.href);
            src = urlObj.origin + '/' + src;
          }
          
          if (!data.images.find(existingImg => existingImg.src === src) && 
              !src.includes('logo') && 
              !src.includes('icon') && 
              !src.includes('banner') &&
              !src.includes('avatar') &&
              !src.includes('related') &&
              !src.includes('similar')) {
            data.images.push({ src });
          }
        }
      }
    });

    // Extract categories - scoped to product container
    // Only get main categories (limit to avoid timeout)
    let categoryElements = productContainer.querySelectorAll('a[href*="product-category"], a[href*="category"], .posted_in a, .product-categories a, [class*="category"] a');
    
    // Limit to first 3 categories to avoid timeout
    let categoryCount = 0;
    categoryElements.forEach((cat) => {
      if (categoryCount >= 3) return; // Limit to 3 categories
      
      if (isInExcludedSection(cat)) {
        return;
      }
      const catName = cat.textContent.trim();
      if (catName && !data.categories.find(c => c.name === catName)) {
        data.categories.push({ name: catName });
        categoryCount++;
      }
    });
    
    // Also try to extract from text like "دسته‌بندی‌ها: حجم زن, ماشین اصلاح"
    if (data.categories.length === 0) {
      const containerText = productContainer.innerText;
      const categoryMatch = containerText.match(/دسته[‌\s]*بندی[‌\s]*ها?[:\s]+([^\n]+)/i) || containerText.match(/categories?[:\s]+([^\n]+)/i);
      if (categoryMatch) {
        const categoriesText = categoryMatch[1].trim();
        const categories = categoriesText.split(',').map(c => c.trim()).filter(c => c && c.length > 0).slice(0, 3);
        categories.forEach((catName) => {
          if (!data.categories.find(c => c.name === catName)) {
            data.categories.push({ name: catName });
          }
        });
      }
    }

    // Extract tags - scoped to product container
    let tagElements = productContainer.querySelectorAll('a[href*="tag"], .tagged_as a, .product-tags a, [class*="tag"] a');
    tagElements.forEach((tag) => {
      if (isInExcludedSection(tag)) {
        return;
      }
      const tagName = tag.textContent.trim();
      if (tagName && !data.tags.find(t => t.name === tagName)) {
        data.tags.push({ name: tagName });
      }
    });

    // Extract product features/specifications
    // Strategy 1: Look for dedicated features sections
    const featureSelectors = [
      '.product-features', '.features', '.specifications', '.specs',
      '[class*="feature"]', '[class*="spec"]', 'ul.product-features', 'ul.features',
      '.woocommerce-product-attributes', '.product-attributes',
      'ul:has(li)', 'ol:has(li)' // Any list with items
    ];
    
    let featuresList = null;
    for (const selector of featureSelectors) {
      try {
        featuresList = productContainer.querySelector(selector);
        if (featuresList && !isInExcludedSection(featuresList)) {
          break;
        }
      } catch (e) {
        // Skip selectors that might not be supported
        continue;
      }
    }
    
    // Strategy 2: Extract from text patterns like "ویژگی های محصول:" followed by features
    const containerText = productContainer.innerText || '';
    // Improved regex to capture all features - look for "ویژگی های محصول:" and capture everything until next major section
    const featuresMatch = containerText.match(/ویژگی[‌\s]*های[‌\s]*محصول[:\s]*([\s\S]*?)(?:\n\s*\n\s*\n|برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی|$)/i) || 
                          containerText.match(/features?[:\s]*([\s\S]*?)(?:\n\s*\n\s*\n|brand|category|price|stock|add|support|$)/i);
    
    if (featuresMatch && featuresMatch[1]) {
      const featuresText = featuresMatch[1].trim();
      // Split by newlines, numbers, or bullet points - NO LIMIT
      const features = featuresText
        .split(/\n|(?=\d+\.)|(?=[•\-\*])|(?=موتور|سرعت|تیغه|باتری|شارژ|وزن|ابعاد|جنس|دارای|مجهز|مناسب)/)
        .map(f => f.replace(/^\d+\.?\s*/, '').replace(/^[•\-\*]\s*/, '').trim())
        .filter(f => f.length > 3 && !f.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی|ویژگی|$)/i));
      
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
            // Filter out non-feature items
            if (featureText && featureText.length > 3 && 
                !featureText.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی)/i) &&
                !isInExcludedSection(item)) {
              data.features.push(featureText);
            }
          });
        }
      }
    }
    
    // Strategy 4: Extract from features list element if found
    if (featuresList && data.features.length === 0) {
      const featureItems = featuresList.querySelectorAll('li, .feature-item, [class*="feature"], dt, dd, p');
      featureItems.forEach((item) => {
        const featureText = item.textContent.trim();
        if (featureText && featureText.length > 3 && !isInExcludedSection(item)) {
          data.features.push(featureText);
        }
      });
    }
    
    // Strategy 5: Extract from short_description text if it contains feature-like content
    // This is important for sites like rezonal.co where features are in short_description
    if (data.features.length === 0 && data.short_description) {
      const shortDescText = data.short_description;
      
      // First, try to find "ویژگی های محصول:" pattern in short_description
      const featuresSectionMatch = shortDescText.match(/ویژگی[‌\s]*های[‌\s]*محصول[:\s]*([\s\S]*)/i);
      if (featuresSectionMatch) {
        const featuresText = featuresSectionMatch[1].trim();
        // Split by numbers, newlines, or common feature keywords
        const features = featuresText
          .split(/(?=\d+\.)|(?=[•\-\*])|(?=موتور|سرعت|تیغه|باتری|شارژ|وزن|ابعاد|جنس|دارای|مجهز|مناسب|طول|ظرفیت|زمان|توان|دارد|است|می|باشد)/)
          .map(f => f.replace(/^\d+\.?\s*/, '').replace(/^[•\-\*]\s*/, '').trim())
          .filter(f => f.length > 5 && !f.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی|ویژگی|$)/i));
        
        if (features.length > 0) {
          data.features = features; // NO LIMIT
        }
      } else {
        // If no "ویژگی های محصول:" pattern, try to parse the whole short_description
        // Look for numbered or bulleted features - improved parsing
        const lines = shortDescText
          .split(/(?=\d+\.)|(?=[•\-\*])|(?=موتور|سرعت|تیغه|باتری|شارژ|وزن|ابعاد|جنس|دارای|مجهز|مناسب|طول|ظرفیت|زمان|توان)/)
          .map(l => l.replace(/^\d+\.?\s*/, '').replace(/^[•\-\*]\s*/, '').trim())
          .filter(l => l.length > 5 && 
                  !l.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی|ویژگی|$)/i));
        
        if (lines.length > 0) {
          data.features = lines; // NO LIMIT - get all features
        }
      }
    }
    
    // Strategy 6: Parse from description HTML if it contains structured features
    if (data.features.length === 0 && data.description) {
      const descHTML = data.description;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = descHTML;
      
      // Look for ordered lists (numbered features)
      const olItems = tempDiv.querySelectorAll('ol li, ul li');
      olItems.forEach((item) => {
        const featureText = item.textContent.trim();
        if (featureText && featureText.length > 3 && 
            !featureText.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی)/i)) {
          data.features.push(featureText);
        }
      });
      
      // Also check for paragraph tags that might contain features
      if (data.features.length === 0) {
        const paragraphs = tempDiv.querySelectorAll('p');
        paragraphs.forEach((p) => {
          const text = p.textContent.trim();
          // Check if paragraph looks like a feature (starts with number or bullet-like pattern)
          if (text.match(/^\d+\.|^[•\-\*]|موتور|سرعت|تیغه|باتری|شارژ|وزن|ابعاد|جنس|دارای|مجهز|مناسب/i) &&
              text.length > 5 && !text.match(/^(برند|دسته|قیمت|موجود|تعداد|افزودن|پشتیبانی)/i)) {
            data.features.push(text);
          }
        });
      }
    }
    
    // Clean up features - remove duplicates and empty items, but keep ALL valid features
    data.features = [...new Set(data.features.filter(f => f && f.length > 3))];

    return data;
  }, baseUrl);

  return productData;
}

