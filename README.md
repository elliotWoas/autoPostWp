# Product Scraper & WooCommerce Uploader

A professional Node.js MVP application that automates scraping products from custom-coded and WordPress e-commerce sites and uploads them to WooCommerce via REST API.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Code Flow](#code-flow)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This application consists of three main components:
1. **Scraper Module**: Extracts product data from e-commerce websites using Puppeteer
2. **Uploader Module**: Uploads scraped products to WooCommerce via REST API
3. **Main Entry Point**: Orchestrates the scraping and uploading process

The system automatically detects whether a site is WordPress/WooCommerce or custom-coded and uses the appropriate scraper.

## ✨ Features

- ✅ **Dual Scraper Support**: Automatically detects and handles WordPress/WooCommerce and custom-coded sites
- ✅ **Comprehensive Data Extraction**: Name, price, description, images, categories, tags, SKU, and features
- ✅ **Product Features Extraction**: Extracts all product specifications/features and adds them as WooCommerce attributes
- ✅ **Smart Image Filtering**: Excludes related products, logos, and non-product images
- ✅ **Category Management**: Only uses existing categories (no auto-creation to prevent timeouts)
- ✅ **Duplicate SKU Handling**: Automatically handles duplicate SKUs
- ✅ **Error Handling**: Robust error handling with detailed logging
- ✅ **All Fields Optional**: Gracefully handles missing data

## 🏗️ Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        main.js                              │
│                  (Entry Point & Orchestrator)              │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────┐              ┌───────────────┐
│  scraper.js   │              │  uploader.js   │
│  (Router)     │              │  (WooCommerce) │
└───────┬───────┘              └───────┬───────┘
        │                               │
        │                               │
┌───────┴────────┐                     │
│                │                     │
▼                ▼                     │
┌──────────────────┐  ┌──────────────────┐
│ scraper-         │  │ scraper-         │
│ wordpress.js     │  │ custom.js        │
│                  │  │                  │
│ (WordPress/      │  │ (Custom Sites)   │
│  WooCommerce)    │  │                  │
└──────────────────┘  └──────────────────┘
```

### Component Interaction Flow

```
User Input (URL)
    │
    ▼
main.js
    │
    ├─► Load .env configuration
    │
    ├─► Call scrapeProduct(url)
    │   │
    │   └─► scraper.js
    │       │
    │       ├─► Launch Puppeteer
    │       │
    │       ├─► Detect Site Type
    │       │   ├─► WordPress? → scraper-wordpress.js
    │       │   └─► Custom? → scraper-custom.js
    │       │
    │       └─► Return productData
    │
    └─► Call uploadProduct(productData)
        │
        └─► uploader.js
            │
            ├─► Initialize WooCommerce API
            │
            ├─► Process Categories (find existing only)
            │
            ├─► Check SKU (handle duplicates)
            │
            ├─► Convert Features → Attributes
            │
            └─► POST to WooCommerce API
```

## 📦 Installation

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- WooCommerce REST API credentials

### Steps

1. **Clone or download the project**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Puppeteer's Chrome browser** (if it was not downloaded during `npm install`)
   ```bash
   npm run install:browser
   ```

4. **Create `.env` file**
   ```bash
   cp .env.example .env
   ```

5. **Configure `.env` file** (see Configuration section)

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Custom E-commerce Site Configuration
CUSTOM_SITE_BASE_URL=https://example-custom-site.com

# WooCommerce Configuration
WOOCOMMERCE_URL=https://your-wordpress-site.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key_here
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret_here

# Puppeteer Configuration (Optional)
# PUPPETEER_EXECUTABLE_PATH=C:/path/to/chromium/chrome.exe
```

### Getting WooCommerce API Credentials

1. Go to WooCommerce → Settings → Advanced → REST API
2. Click "Add Key"
3. Set permissions to "Read/Write"
4. Copy the Consumer Key and Consumer Secret

## 🚀 Usage

### Basic Usage

```bash
node main.js <product_url>
```

### Examples

```bash
# WordPress/WooCommerce site
node main.js https://rezonal.co/product/clipper-titan-plus/

# Custom-coded site
node main.js https://www.tehranjanebi.com/product/PSH954-ProOne-Rechargeable-Shaver/
```

### Output

The application will:
1. Scrape product data from the URL
2. Display extracted information
3. Upload to WooCommerce
4. Show the created product ID

## 📁 Project Structure

```
autoPost/
│
├── main.js                 # Entry point - orchestrates scraping and uploading
├── scraper.js              # Main scraper router - detects site type
├── scraper-wordpress.js    # WordPress/WooCommerce site scraper
├── scraper-custom.js       # Custom-coded site scraper
├── uploader.js             # WooCommerce API uploader
├── package.json            # Dependencies and scripts
├── .env                    # Environment variables (not in git)
├── .env.example            # Example environment file
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

### File Responsibilities

| File | Responsibility |
|------|---------------|
| `main.js` | CLI interface, orchestrates scraping → uploading flow |
| `scraper.js` | Launches Puppeteer, detects site type, routes to appropriate scraper |
| `scraper-wordpress.js` | Extracts data from WordPress/WooCommerce sites |
| `scraper-custom.js` | Extracts data from custom-coded e-commerce sites |
| `uploader.js` | Handles WooCommerce API communication, product creation |

## 🔄 Code Flow

### Detailed Flowchart

```
START
  │
  ├─► Parse CLI arguments (product URL)
  │
  ├─► Load .env configuration
  │
  ├─► STEP 1: SCRAPING
  │   │
  │   ├─► Launch Puppeteer browser
  │   │
  │   ├─► Navigate to product URL
  │   │
  │   ├─► Wait for page load
  │   │
  │   ├─► Detect Site Type
  │   │   ├─► Check for WooCommerce indicators
  │   │   │   ├─► .woocommerce classes?
  │   │   │   ├─► wp-content in URLs?
  │   │   │   └─► woocommerce in scripts?
  │   │   │
  │   │   ├─► WordPress? → scraper-wordpress.js
  │   │   │   ├─► Find product container
  │   │   │   ├─► Extract: name, price, description, images, etc.
  │   │   │   ├─► Exclude related products
  │   │   │   └─► Extract features (multiple strategies)
  │   │   │
  │   │   └─► Custom? → scraper-custom.js
  │   │       ├─► Extract: name, price, description, images, etc.
  │   │       └─► Extract features (text pattern matching)
  │   │
  │   └─► Return productData object
  │
  ├─► STEP 2: UPLOADING
  │   │
  │   ├─► Initialize WooCommerce API client
  │   │
  │   ├─► Process Categories
  │   │   ├─► Get first category only
  │   │   ├─► Find existing category (don't create)
  │   │   └─► Return category ID
  │   │
  │   ├─► Check SKU
  │   │   ├─► Query existing products with same SKU
  │   │   ├─► Duplicate? → Skip SKU
  │   │   └─► Unique? → Add SKU
  │   │
  │   ├─► Convert Features to Attributes
  │   │   ├─► Create "ویژگی های محصول" attribute
  │   │   ├─► Add all features as options
  │   │   └─► Set visible: true
  │   │
  │   ├─► Build WooCommerce Product Object
  │   │   ├─► name, type, status
  │   │   ├─► price, sale_price
  │   │   ├─► description, short_description
  │   │   ├─► images, categories, tags
  │   │   ├─► sku
  │   │   └─► attributes (features)
  │   │
  │   ├─► POST to WooCommerce API
  │   │   ├─► Success? → Return product ID
  │   │   └─► Error? → Handle (retry without SKU if duplicate)
  │   │
  │   └─► Return product ID
  │
  └─► END (Display success/error)
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT: Product URL                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    SCRAPER MODULE                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Puppeteer Browser                                    │  │
│  │  ├─► Navigate to URL                                  │  │
│  │  ├─► Wait for content                                 │  │
│  │  └─► Extract data via page.evaluate()                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Product Data Object                                  │  │
│  │  {                                                    │  │
│  │    name: string,                                      │  │
│  │    description: string,                                │  │
│  │    short_description: string,                         │  │
│  │    regular_price: string,                             │  │
│  │    sale_price: string,                                │  │
│  │    sku: string,                                       │  │
│  │    images: [{src: string}],                           │  │
│  │    categories: [{name: string}],                      │  │
│  │    tags: [{name: string}],                            │  │
│  │    features: [string]  ← ALL FEATURES                 │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    UPLOADER MODULE                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WooCommerce API Client                                │  │
│  │  ├─► Process categories                                │  │
│  │  ├─► Check SKU                                        │  │
│  │  ├─► Convert features → attributes                    │  │
│  │  └─► POST /products                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WooCommerce Product Object                            │  │
│  │  {                                                    │  │
│  │    name: string,                                      │  │
│  │    type: 'simple',                                    │  │
│  │    status: 'draft',                                   │  │
│  │    regular_price: string,                             │  │
│  │    description: string (with features HTML),          │  │
│  │    images: [{src: string}],                           │  │
│  │    categories: [{id: number}],                        │  │
│  │    attributes: [{                                      │  │
│  │      name: 'ویژگی های محصول',                         │  │
│  │      options: [string]  ← ALL FEATURES                │  │
│  │    }]                                                 │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              OUTPUT: Product ID (WooCommerce)                │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 Feature Extraction Strategy

The application uses multiple strategies to extract product features:

```
Strategy 1: Dedicated Features Sections
    ├─► Look for: .product-features, .features, .specifications
    └─► Extract from: <ul>, <ol>, <dl> elements

Strategy 2: Text Pattern Matching
    ├─► Look for: "ویژگی های محصول:" pattern
    └─► Extract: All text after pattern until next section

Strategy 3: HTML Lists in Description
    ├─► Parse description HTML
    └─► Extract: <li>, <dt>, <dd> elements

Strategy 4: Features List Element
    ├─► Find features container
    └─► Extract: All child elements

Strategy 5: Short Description Parsing
    ├─► Parse short_description text
    ├─► Split by: numbers, bullets, keywords
    └─► Extract: All feature-like lines

Strategy 6: Description HTML Parsing
    ├─► Parse description HTML
    └─► Extract: Ordered/unordered lists, paragraphs
```

## 📚 API Reference

### `scrapeProduct(url, baseUrl)`

Scrapes product data from a URL.

**Parameters:**
- `url` (string): Product URL to scrape
- `baseUrl` (string, optional): Base URL for resolving relative image paths

**Returns:** `Promise<Object>`
```javascript
{
  name: string,
  description: string,
  short_description: string,
  regular_price: string,
  sale_price: string,
  sku: string,
  images: Array<{src: string}>,
  categories: Array<{name: string}>,
  tags: Array<{name: string}>,
  features: Array<string>  // ALL features extracted
}
```

### `uploadProduct(productData)`

Uploads product to WooCommerce.

**Parameters:**
- `productData` (Object): Product data from scraper

**Returns:** `Promise<number>` - Created product ID

**Throws:** Error if upload fails

## 🐛 Troubleshooting

### Common Issues

1. **"WooCommerceRestApi is not a constructor"**
   - Fixed: The package uses nested default export
   - Solution: Use `WooCommercePackage.default?.default`

2. **"SKU نامعتبر یا تکراری است"**
   - Fixed: Automatic duplicate SKU detection
   - Solution: Retries without SKU if duplicate

3. **"Request Timeout" (500 error)**
   - Fixed: Limited category processing to first category only
   - Solution: Only processes first category to avoid timeout

4. **Features not extracted**
   - Fixed: Multiple extraction strategies
   - Solution: Checks description, short_description, and dedicated sections

5. **Images from related products included**
   - Fixed: Excludes related products sections
   - Solution: Scopes extraction to main product container

### Debug Mode

Enable verbose logging by checking console output. All steps are logged with `[Scraper]` or `[Uploader]` prefixes.

## 🔧 Customization

### Adding New Site Types

1. Create new scraper file: `scraper-newsite.js`
2. Export `scrapeNewSite(url, baseUrl, page)` function
3. Update `scraper.js` to detect and route to new scraper

### Modifying Selectors

Update selectors in:
- `scraper-wordpress.js` - For WordPress sites
- `scraper-custom.js` - For custom sites

### Changing Product Status

In `uploader.js`, change:
```javascript
status: 'draft',  // Change to 'publish' for auto-publish
```

## 📝 Notes

- All fields are optional - the app handles missing data gracefully
- Products are created as "draft" by default for review
- Only first category is used to prevent API timeouts
- Features are added both as attributes and in description
- Images are filtered to exclude logos, icons, and related products

## 📄 License

MIT

## 👤 Author

Created for automated product migration from e-commerce sites to WooCommerce.
