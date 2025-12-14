# Architecture Documentation

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────┐
│                         USER                                 │
│                    (Command Line)                            │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            │ URL Input
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      main.js                                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │  • CLI Argument Parsing                            │    │
│  │  • Environment Variable Loading                    │    │
│  │  • Error Handling & Logging                         │    │
│  │  • Orchestration: Scrape → Upload                  │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────┬───────────────────────┬─────────────────────┘
                │                       │
                │                       │
    ┌───────────▼──────────┐  ┌─────────▼──────────┐
    │    scraper.js        │  │   uploader.js      │
    │  (Scraper Router)    │  │ (WooCommerce API)  │
    └───────────┬──────────┘  └─────────┬──────────┘
                │                       │
                │                       │
    ┌───────────┴──────────┐            │
    │                      │            │
    ▼                      ▼            │
┌──────────────┐    ┌──────────────┐    │
│ scraper-     │    │ scraper-     │    │
│ wordpress.js │    │ custom.js    │    │
└──────────────┘    └──────────────┘    │
                                         │
                                         │
                            ┌────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ WooCommerce  │
                    │   REST API   │
                    └──────────────┘
```

## Module Breakdown

### 1. main.js - Entry Point

**Responsibilities:**
- Parse command-line arguments
- Load environment variables
- Orchestrate scraping and uploading
- Handle errors and display results

**Key Functions:**
- `main()` - Main entry point

**Flow:**
```
main()
  ├─► Validate URL
  ├─► Load .env
  ├─► Call scrapeProduct()
  ├─► Call uploadProduct()
  └─► Display results
```

### 2. scraper.js - Scraper Router

**Responsibilities:**
- Launch and manage Puppeteer browser
- Detect site type (WordPress vs Custom)
- Route to appropriate scraper
- Handle browser lifecycle

**Key Functions:**
- `scrapeProduct(url, baseUrl)` - Main scraper function
- `isWordPressSite(page)` - Site type detection

**Detection Logic:**
```javascript
WordPress Detection:
  ├─► .woocommerce classes exist?
  ├─► wp-content in URLs?
  ├─► woocommerce in scripts?
  └─► Result: WordPress → scraper-wordpress.js
      Custom → scraper-custom.js
```

### 3. scraper-wordpress.js - WordPress Scraper

**Responsibilities:**
- Extract data from WordPress/WooCommerce sites
- Scope extraction to product container
- Exclude related products
- Extract features using multiple strategies

**Extraction Strategy:**
```
1. Find Product Container
   ├─► .product, .woocommerce-product, .product-details
   └─► Fallback: main, .main-content

2. Exclude Related Products
   ├─► .related-products, .upsells, .cross-sells
   └─► Helper: isInExcludedSection()

3. Extract Data (scoped to container)
   ├─► Name: h1, .product-title
   ├─► Price: .price, .woocommerce-Price-amount
   ├─► Images: Product gallery only
   ├─► Categories: First 3 only
   └─► Features: Multiple strategies (see below)

4. Extract Features (6 strategies)
   ├─► Strategy 1: Dedicated features sections
   ├─► Strategy 2: "ویژگی های محصول:" pattern
   ├─► Strategy 3: HTML lists in description
   ├─► Strategy 4: Features list element
   ├─► Strategy 5: Short description parsing
   └─► Strategy 6: Description HTML parsing
```

### 4. scraper-custom.js - Custom Site Scraper

**Responsibilities:**
- Extract data from custom-coded sites
- Handle Persian/Farsi text patterns
- Extract product ID as SKU
- Extract features from text

**Key Differences from WordPress Scraper:**
- No product container scoping (uses body)
- Text pattern matching for categories/tags
- Product ID extraction from text
- Simpler image filtering

### 5. uploader.js - WooCommerce Uploader

**Responsibilities:**
- Initialize WooCommerce API client
- Process categories (find existing only)
- Handle duplicate SKUs
- Convert features to attributes
- Upload product to WooCommerce

**Key Functions:**
- `initWooCommerceAPI()` - Initialize API client
- `getExistingCategory()` - Find category (don't create)
- `processCategories()` - Process categories
- `uploadProduct()` - Main upload function

**Upload Flow:**
```
uploadProduct(productData)
  ├─► Initialize WooCommerce API
  ├─► Process Categories
  │   └─► Get first category only (prevent timeout)
  ├─► Check SKU
  │   ├─► Query existing products
  │   └─► Duplicate? → Skip SKU
  ├─► Convert Features → Attributes
  │   ├─► Create "ویژگی های محصول" attribute
  │   └─► Add all features as options
  ├─► Build Product Object
  └─► POST to WooCommerce API
      ├─► Success → Return product ID
      └─► Error → Retry without SKU if duplicate
```

## Data Structures

### Product Data Object (from Scraper)

```javascript
{
  name: string,                    // Product name
  description: string,              // Full description (HTML)
  short_description: string,       // Short description
  regular_price: string,           // Regular price (numeric string)
  sale_price: string,             // Sale price (optional)
  sku: string,                    // SKU/Product ID
  images: Array<{                 // Product images
    src: string                   // Full image URL
  }>,
  categories: Array<{             // Product categories
    name: string                  // Category name
  }>,
  tags: Array<{                   // Product tags
    name: string                  // Tag name
  }>,
  features: Array<string>          // ALL product features
}
```

### WooCommerce Product Object

```javascript
{
  name: string,
  type: 'simple',
  status: 'draft',
  regular_price: string,
  sale_price: string,             // Optional
  description: string,             // With features HTML
  short_description: string,
  sku: string,                     // Optional
  images: Array<{
    src: string
  }>,
  categories: Array<{
    id: number
  }>,
  tags: Array<{
    name: string
  }>,
  attributes: Array<{              // Product attributes
    id: 0,                         // 0 = new attribute
    name: 'ویژگی های محصول',
    options: Array<string>,        // ALL features
    visible: true,
    variation: false
  }>
}
```

## Feature Extraction Deep Dive

### Strategy Flowchart

```
START Feature Extraction
  │
  ├─► Strategy 1: Dedicated Features Sections
  │   ├─► Selectors: .product-features, .features, .specifications
  │   └─► Found? → Extract <li> elements → END
  │
  ├─► Strategy 2: Text Pattern Matching
  │   ├─► Pattern: "ویژگی های محصول:"
  │   ├─► Extract: All text after pattern
  │   ├─► Split by: \n, numbers, bullets, keywords
  │   └─► Found? → Extract features → END
  │
  ├─► Strategy 3: HTML Lists in Description
  │   ├─► Parse description HTML
  │   ├─► Find: <li>, <dt>, <dd> elements
  │   └─► Found? → Extract → END
  │
  ├─► Strategy 4: Features List Element
  │   ├─► Find features container
  │   ├─► Extract child elements
  │   └─► Found? → Extract → END
  │
  ├─► Strategy 5: Short Description Parsing
  │   ├─► Parse short_description text
  │   ├─► Split by: numbers, bullets, keywords
  │   └─► Found? → Extract → END
  │
  └─► Strategy 6: Description HTML Parsing
      ├─► Parse description HTML
      ├─► Find: <ol>, <ul>, <p> elements
      └─► Extract → END
```

### Feature Parsing Keywords

The system splits features by these Persian keywords:
- موتور (Motor)
- سرعت (Speed)
- تیغه (Blade)
- باتری (Battery)
- شارژ (Charge)
- وزن (Weight)
- ابعاد (Dimensions)
- جنس (Material)
- دارای (Has)
- مجهز (Equipped)
- مناسب (Suitable)
- طول (Length)
- ظرفیت (Capacity)
- زمان (Time)
- توان (Power)

## Error Handling

### Error Flow

```
Error Occurs
  │
  ├─► Scraping Error?
  │   ├─► Timeout → "Scraping timeout: The page took too long to load"
  │   ├─► Selector not found → Continue (all fields optional)
  │   └─► Other → Log and throw
  │
  ├─► Upload Error?
  │   ├─► 401/403 → "WooCommerce authentication failed"
  │   ├─► 400 (SKU duplicate) → Retry without SKU
  │   ├─► 400 (other) → "Invalid product data"
  │   ├─► 404 → "WooCommerce API endpoint not found"
  │   ├─► 500 → "Request Timeout" (category processing issue)
  │   └─► Other → Log and throw
  │
  └─► Display error message to user
```

## Performance Optimizations

1. **Category Limiting**: Only processes first category to prevent API timeout
2. **Image Filtering**: Excludes small images, logos, icons before processing
3. **Browser Reuse**: Single browser instance per scrape
4. **Early Exit**: Stops feature extraction once features found
5. **Duplicate Removal**: Removes duplicate features before upload

## Security Considerations

1. **Environment Variables**: All sensitive data in .env (not committed)
2. **Input Validation**: URL validation before processing
3. **Error Messages**: Don't expose sensitive information
4. **API Authentication**: Uses WooCommerce REST API with query string auth

## Extension Points

### Adding New Site Type

1. Create `scraper-newsite.js`
2. Export `scrapeNewSite(url, baseUrl, page)`
3. Update `isWordPressSite()` or add new detection in `scraper.js`

### Adding New Extraction Field

1. Add to data object in scraper
2. Add extraction logic in appropriate scraper
3. Add mapping in `uploader.js`
4. Update documentation

### Batch Processing

Future extension: Modify `main.js` to accept multiple URLs and process in parallel with rate limiting.

