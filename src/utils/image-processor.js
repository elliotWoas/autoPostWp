// image-processor.js
import sharp from 'sharp';
import axios from 'axios';

/**
 * Downloads an image from URL and returns it as Buffer
 * @param {string} imageUrl - URL of the image to download
 * @returns {Promise<Buffer>} Image buffer
 */
export async function downloadImage(imageUrl) {
    try {
        console.log(`[Image Processor] Downloading image: ${imageUrl}`);
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        console.error(`[Image Processor] Failed to download image: ${error.message}`);
        throw error;
    }
}

/**
 * Removes watermark from bottom left corner of the image by painting over it
 * with a sampled background color. Uses a top-layer SVG rectangle (blend: 'over').
 *
 * Options:
 *  - position: 'bottom-left' (only supported currently)
 *  - width, height, margin: watermark rectangle
 *  - sampleSize: size of sampling box (px) used to compute background color
 *  - expand: extra pixels to expand the rect to avoid visible edges
 *  - blur: radius to slightly blur the whole image after overlay to blend seams (0 = disabled)
 */
// Replace your current removeWatermark with this exact function
export async function removeWatermark(imageBuffer, options = {}) {
    try {
      console.log('[Image Processor] Removing watermark (bottom-left anchored, scaled cover)...');
  
      const defaults = {
        // base watermark box size you previously measured
        width: 120,
        height: 50,
        margin: 10,
  
        // scale factors: how many times bigger than the base box (to the right and upward)
        scaleX: 2,   // width multiplier (to the right)
        scaleY: 5,   // height multiplier (upwards)
  
        // fill color for the cover (use '#FFFFFF, #f52525 :  red' for white)
        fillColor: '#FFFFFF',
  
        // optional blur to blend the seam (0 = none)
        blur: 0
      };
      const cfg = { ...defaults, ...options };
  
      const img = sharp(imageBuffer);
      const metadata = await img.metadata();
      if (!metadata || !metadata.width || !metadata.height) {
        console.warn('[Image Processor] Could not read image metadata — skipping watermark removal');
        return imageBuffer;
      }
  
      // Compute scaled cover dimensions
      const maxAvailableWidth = metadata.width - cfg.margin; // space to the right from margin
      const maxAvailableHeight = metadata.height - cfg.margin; // space from top margin (we anchor bottom)
  
      const scaledWidth = Math.min(maxAvailableWidth, Math.round(cfg.width * cfg.scaleX));
      const scaledHeight = Math.min(maxAvailableHeight, Math.round(cfg.height * cfg.scaleY));
  
      // Anchor bottom-left: left = margin; bottom edge remains margin from bottom -> compute top
      const left = Math.max(0, cfg.margin);
      const top = Math.max(0, metadata.height - scaledHeight - cfg.margin);
  
      // Ensure the rect is inside image
      const rect = {
        left,
        top,
        width: Math.min(scaledWidth, metadata.width - left),
        height: Math.min(scaledHeight, metadata.height - top)
      };
  
      // Build SVG overlay that paints the cover rectangle ON TOP of the image
      const svg = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="${cfg.fillColor}" />
      </svg>`;
  
      let composed = await img
        .composite([{ input: Buffer.from(svg), blend: 'over' }])
        .toBuffer();
  
      if (cfg.blur && cfg.blur > 0) {
        composed = await sharp(composed).blur(cfg.blur).toBuffer();
      }
  
      console.log(`[Image Processor] Applied cover rect at (${rect.left}, ${rect.top}) size ${rect.width}x${rect.height}`);
      return composed;
    } catch (err) {
      console.error('[Image Processor] removeWatermark (anchor) failed:', err.message);
      return imageBuffer;
    }
  }
  
  

/**
 * Processes image: downloads and removes watermark
 * @param {string} imageUrl - URL of the image
 * @param {Object} watermarkOptions - Watermark removal options
 * @returns {Promise<{buffer: Buffer, filename: string}>} Processed image data
 */
export async function processProductImage(imageUrl, watermarkOptions = {}) {
    try {
        // Download image
        const originalBuffer = await downloadImage(imageUrl);
        
        // Remove watermark
        const processedBuffer = await removeWatermark(originalBuffer, watermarkOptions);
        
        // Generate filename
        const filename = generateImageFilename(imageUrl);
        
        return {
            buffer: processedBuffer,
            filename: filename,
            originalUrl: imageUrl
        };
    } catch (error) {
        console.error(`[Image Processor] Failed to process image: ${error.message}`);
        throw error;
    }
}

/**
 * Generates a safe filename from image URL
 * @param {string} imageUrl - Image URL
 * @returns {string} Safe filename
 */
function generateImageFilename(imageUrl) {
    const urlParts = imageUrl.split('/');
    let filename = urlParts[urlParts.length - 1].split('?')[0];
    
    // Clean the filename
    filename = filename
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .toLowerCase();
    
    // Add timestamp to avoid conflicts
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    
    return `product-${timestamp}-${random}-${filename}`;
}

/**
 * Batch process multiple images
 * @param {Array<string>} imageUrls - Array of image URLs
 * @param {Object} watermarkOptions - Watermark removal options
 * @returns {Promise<Array>} Array of processed images
 */
export async function batchProcessImages(imageUrls, watermarkOptions = {}) {
    console.log(`[Image Processor] Processing ${imageUrls.length} images...`);
    
    const processedImages = [];
    
    for (const [index, imageUrl] of imageUrls.entries()) {
        try {
            console.log(`[Image Processor] Processing image ${index + 1}/${imageUrls.length}`);
            const processedImage = await processProductImage(imageUrl, watermarkOptions);
            processedImages.push(processedImage);
        } catch (error) {
            console.error(`[Image Processor] Skipping image ${imageUrl}: ${error.message}`);
        }
    }
    
    console.log(`[Image Processor] Successfully processed ${processedImages.length}/${imageUrls.length} images`);
    return processedImages;
}

export default {
    downloadImage,
    removeWatermark,
    processProductImage,
    batchProcessImages
};