# Quick Reference Guide

## File Locations

| What You Need | File Location |
|---------------|---------------|
| Main entry point | `main.js` |
| Scraper router | `scraper.js` |
| WordPress scraper | `scraper-wordpress.js` |
| Custom site scraper | `scraper-custom.js` |
| WooCommerce uploader | `uploader.js` |
| Configuration | `.env` |
| Dependencies | `package.json` |

## Common Tasks

<!-- ### Change Product Status
**File**: `uploader.js`  
**Line**: ~117  
**Change**: `status: 'draft'` → `status: 'publish'` -->



### Change Category Limit
**File**: `uploader.js`  
**Function**: `processCategories()`  
**Change**: Currently uses `firstCategory` only

### Modify Feature Extraction
**File**: `scraper-wordpress.js`  
**Section**: "Extract product features"  
**Strategies**: 1-6 (add new if needed)

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `scrapeProduct()` | `scraper.js` | Main scraper entry |
| `isWordPressSite()` | `scraper.js` | Site type detection |
| `scrapeWordPressSite()` | `scraper-wordpress.js` | WordPress extraction |
| `scrapeCustomSite()` | `scraper-custom.js` | Custom site extraction |
| `uploadProduct()` | `uploader.js` | WooCommerce upload |
| `getExistingCategory()` | `uploader.js` | Find category |

## Data Flow

```
URL → scraper.js → (wordpress/custom).js → productData
productData → uploader.js → WooCommerce API → Product ID
```

## Environment Variables

```env
CUSTOM_SITE_BASE_URL=...
WOOCOMMERCE_URL=...
WOOCOMMERCE_CONSUMER_KEY=...
WOOCOMMERCE_CONSUMER_SECRET=...
PUPPETEER_EXECUTABLE_PATH=... (optional)
```

## Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| 400 (SKU) | Duplicate SKU | Auto-handled (retries without SKU) |
| 400 (other) | Invalid data | Check product data structure |
| 401/403 | Auth failed | Check API credentials |
| 404 | Endpoint not found | Check WooCommerce URL |
| 500 | Timeout | Already handled (category limit) |

## Selector Patterns

### WordPress Sites
- Name: `h1`
- Price: `.price, .woocommerce-Price-amount`
- Images: `.woocommerce-product-gallery img`
- Categories: `a[href*="product-category"]`

### Custom Sites
- Name: `h1, .product-title`
- Price: `.price, [class*="price"]`
- Images: All `img` (filtered)
- Categories: `a[href*="category"]`

## Feature Extraction Keywords

Persian keywords used for splitting:
- موتور, سرعت, تیغه, باتری, شارژ
- وزن, ابعاد, جنس, دارای, مجهز
- مناسب, طول, ظرفیت, زمان, توان

## Logging Prefixes

- `[Scraper]` - Main scraper
- `[WordPress Scraper]` - WordPress extraction
- `[Custom Scraper]` - Custom extraction
- `[Uploader]` - WooCommerce operations

## Testing Commands

```bash
# Test WordPress site
node main.js https://rezonal.co/product/example/

# Test custom site
node main.js https://tehranjanebi.com/product/example/

# Install dependencies
npm install
```

## Important Notes

- ✅ All fields optional
- ✅ Products created as "draft"
- ✅ Only first category used
- ✅ All features extracted (no limit)
- ✅ Features added as attributes
- ✅ Duplicate SKU handled automatically

