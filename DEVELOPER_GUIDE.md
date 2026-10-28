# Developer Guide

## Quick Start for Developers

### Understanding the Codebase

This guide helps developers quickly understand and modify the codebase.

## Code Structure Overview

```
main.js
  └─► Entry point
      ├─► Validates input
      ├─► Calls scraper
      └─► Calls uploader

scraper.js
  └─► Router
      ├─► Launches Puppeteer
      ├─► Detects site type
      └─► Routes to:
          ├─► scraper-wordpress.js
          └─► scraper-custom.js

uploader.js
  └─► WooCommerce integration
      ├─► Processes categories
      ├─► Handles SKU
      ├─► Converts features
      └─► Uploads product
```

## Key Design Decisions

### 1. Why Separate Scrapers?

**Reason**: WordPress/WooCommerce sites have standardized structure, while custom sites vary widely.

**Implementation**:
- `scraper-wordpress.js`: Uses WooCommerce-specific selectors
- `scraper-custom.js`: Uses flexible pattern matching

### 2. Why Limit Categories?

**Reason**: Processing many categories causes API timeouts (500 errors).

**Implementation**:
- Only processes first category
- Uses existing categories only (no creation)

### 3. Why Multiple Feature Extraction Strategies?

**Reason**: Different sites structure features differently.

**Implementation**:
- 6 different strategies
- Tries each until features found
- No limit on number of features

### 4. Why Optional Fields?

**Reason**: Not all sites have all data (e.g., price behind login).

**Implementation**:
- All fields optional
- Graceful degradation
- Defaults when needed

## Common Modifications

### Adding a New Field

**Example**: Add "brand" field

1. **Update scraper data structure**:
```javascript
// In scraper-wordpress.js or scraper-custom.js
const data = {
  // ... existing fields
  brand: '',  // Add new field
};
```

2. **Add extraction logic**:
```javascript
// Extract brand
let brandElement = productContainer.querySelector('.brand, [class*="brand"]');
if (brandElement) {
  data.brand = brandElement.textContent.trim();
}
```

3. **Update uploader**:
```javascript
// In uploader.js
if (productData.brand) {
  wooCommerceProduct.meta_data = [
    { key: 'brand', value: productData.brand }
  ];
}
```

### Modifying Selectors

**Location**: `scraper-wordpress.js` or `scraper-custom.js`

**Example**: Change price selector
```javascript
// Find this line:
let priceElement = productContainer.querySelector('.price, .woocommerce-Price-amount');

// Change to:
let priceElement = productContainer.querySelector('.my-custom-price-selector');
```

### Changing Product Status

**Location**: `uploader.js` line ~117

```javascript
// Change from:
status: 'draft',

// To:
status: 'publish',  // Auto-publish products
```

### Adding Custom Site Type

1. **Create new scraper file**: `scraper-newsite.js`
```javascript
export async function scrapeNewSite(url, baseUrl, page) {
  // Your extraction logic
  return productData;
}
```

2. **Update detection in `scraper.js`**:
```javascript
// Add detection logic
const isNewSite = await page.evaluate(() => {
  return !!document.querySelector('.newsite-indicator');
});

if (isNewSite) {
  productData = await scrapeNewSite(url, baseUrl, page);
}
```

## Debugging Tips

### Enable Verbose Logging

All modules use console.log with prefixes:
- `[Scraper]` - Scraping operations
- `[Uploader]` - Upload operations
- `[WordPress Scraper]` - WordPress-specific
- `[Custom Scraper]` - Custom site-specific

### Common Issues

1. **Features not extracted**
   - Check console for which strategy was used
   - Inspect page HTML to see actual structure
   - Add new strategy if needed

2. **Images not found**
   - Check if images are lazy-loaded
   - Verify image container selectors
   - Check if images are in excluded sections

3. **Price not found**
   - Price might be behind login
   - Check if price selector matches site
   - Verify price is in product container

4. **Timeout errors**
   - Reduce category processing
   - Check network speed
   - Increase Puppeteer timeout

## Testing

### Test with Different Sites

```bash
# WordPress site
node main.js https://rezonal.co/product/example/

# Custom site
node main.js https://tehranjanebi.com/product/example/
```

### Test Individual Modules

Create test file: `test-scraper.js`
```javascript
import { scrapeProduct } from './scraper.js';

const url = 'https://example.com/product/123';
const data = await scrapeProduct(url);
console.log(JSON.stringify(data, null, 2));
```

## Code Patterns

### Pattern: Optional Field Extraction

```javascript
// Always check if element exists
let element = container.querySelector('.selector');
if (element) {
  data.field = element.textContent.trim();
}
// If not found, field remains empty (optional)
```

### Pattern: Multiple Strategy Extraction

```javascript
// Try multiple strategies
let result = null;
for (const strategy of strategies) {
  result = tryStrategy(strategy);
  if (result) break;  // Early exit when found
}
```

### Pattern: Error Handling

```javascript
try {
  // Operation
} catch (error) {
  console.error('[Module] Error:', error.message);
  // Handle specific errors
  if (error.name === 'TimeoutError') {
    // Specific handling
  }
  throw error;  // Re-throw if can't handle
}
```

## Performance Considerations

1. **Browser Reuse**: Single browser per scrape
2. **Early Exit**: Stop when data found
3. **Limit Processing**: Only first category
4. **Filter Early**: Exclude images before processing
5. **Batch Operations**: Future: process multiple URLs

## Security Considerations

1. **Never commit .env**: Already in .gitignore
2. **Validate URLs**: Check URL format
3. **Sanitize Input**: Escape HTML in descriptions
4. **Error Messages**: Don't expose sensitive data

## Extension Ideas

### Batch Processing

```javascript
// Future: Process multiple URLs
const urls = ['url1', 'url2', 'url3'];
for (const url of urls) {
  await scrapeAndUpload(url);
  await delay(1000);  // Rate limiting
}
```

### Retry Logic

```javascript
// Future: Retry on failure
let retries = 3;
while (retries > 0) {
  try {
    return await uploadProduct(data);
  } catch (error) {
    retries--;
    if (retries === 0) throw error;
    await delay(2000);
  }
}
```

### Progress Tracking

```javascript
// Future: Track progress
const total = urls.length;
let completed = 0;
for (const url of urls) {
  await process(url);
  completed++;
  console.log(`Progress: ${completed}/${total}`);
}
```

## Code Quality

### Linting

The project uses ES6+ standards. No linter errors should be present.

### Code Style

- Use async/await (not promises)
- Use const/let (not var)
- Use template literals
- Use arrow functions where appropriate
- Add comments for complex logic

### Error Messages

- Be descriptive
- Include context (URL, field name)
- Provide actionable tips
- Don't expose sensitive data

## Contributing

When modifying code:

1. **Test with real sites**: Use actual product URLs
2. **Check all fields**: Verify all data is extracted
3. **Handle errors**: Add proper error handling
4. **Update docs**: Update relevant documentation
5. **Log changes**: Add console.log for debugging

## Questions?

Check:
- `README.md` - General documentation
- `ARCHITECTURE.md` - System architecture
- `FLOWCHARTS.md` - Visual flow diagrams
- Code comments - Inline documentation

