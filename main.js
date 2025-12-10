import dotenv from 'dotenv';
import { scrapeProduct } from './scraper.js';
import { uploadProduct } from './uploader.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the product scraper and uploader
 * Usage: node main.js <product_url>
 * 
 * Example:
 *   node main.js https://custom-site.com/product/123
 * 
 * Test URL (replace with your actual product URL):
 *   node main.js https://example-custom-site.com/products/example-product
 */
async function main() {
  // Get product URL from command line arguments
  const productUrl = process.argv[2];

  if (!productUrl) {
    console.error('Error: Product URL is required');
    console.log('Usage: node main.js <product_url>');
    console.log('Example: node main.js https://custom-site.com/product/123');
    process.exit(1);
  }

  // Validate URL format
  try {
    new URL(productUrl);
  } catch (error) {
    console.error('Error: Invalid URL format');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Product Scraper & WooCommerce Uploader');
  console.log('='.repeat(60));
  console.log(`Target URL: ${productUrl}`);
  console.log('');

  let productData = null;
  let productId = null;

  try {
    // Step 1: Scrape product data
    console.log('[Main] Step 1: Scraping product data...');
    console.log('');
    
    const baseUrl = process.env.CUSTOM_SITE_BASE_URL || '';
    productData = await scrapeProduct(productUrl, baseUrl);
    
    console.log('');
    console.log('[Main] Scraping completed successfully');
    console.log('');

    // Step 2: Upload to WooCommerce
    console.log('[Main] Step 2: Uploading product to WooCommerce...');
    console.log('');
    
    productId = await uploadProduct(productData);
    
    console.log('');
    console.log('[Main] Upload completed successfully');
    console.log('');

    // Success summary
    console.log('='.repeat(60));
    console.log('SUCCESS: Product created successfully!');
    console.log('='.repeat(60));
    console.log(`Product Name: ${productData.name || '(no name)'}`);
    console.log(`Product ID: ${productId}`);
    console.log(`Price: ${productData.regular_price || '(not set)'}`);
    if (productData.sale_price) {
      console.log(`Sale Price: ${productData.sale_price}`);
    }
    console.log(`SKU: ${productData.sku || '(not set)'}`);
    console.log(`Images: ${productData.images.length}`);
    console.log(`Categories: ${productData.categories.length}`);
    console.log(`Tags: ${productData.tags.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('ERROR: Operation failed');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('');
    
    // Provide helpful error context
    if (error.message.includes('selector')) {
      console.error('Tip: Check your selectors in scraper.js to match your site structure.');
    } else if (error.message.includes('authentication') || error.message.includes('credentials')) {
      console.error('Tip: Verify your WooCommerce API credentials in .env file.');
    } else if (error.message.includes('timeout')) {
      console.error('Tip: The target site may be slow or the selectors may be incorrect.');
    }
    
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

