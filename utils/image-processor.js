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
export async function removeWatermark(imageBuffer, options = {}) {
    try {
      console.log('[Image Processor] Removing watermark (improved)...');
  
      const defaults = {
        position: 'bottom-left',
        width: 120,
        height: 50,
        margin: 10,
        backgroundColor: '#FFFFFF',
        sampleSize: 24, // square sample area for averaging background color
        expand: 6,      // expand the rect a few pixels for clean cover
        blur: 0         // small blur radius (0 to disable)
      };
      const cfg = { ...defaults, ...options };
  
      const img = sharp(imageBuffer);
      const metadata = await img.metadata();
  
      if (!metadata || !metadata.width || !metadata.height) {
        console.warn('[Image Processor] Could not read image metadata — skipping watermark removal');
        return imageBuffer;
      }
  
      // Calculate watermark rectangle coordinates (bottom-left)
      const rect = {
        left: cfg.margin,
        top: Math.max(0, metadata.height - cfg.height - cfg.margin),
        width: Math.min(cfg.width, metadata.width - cfg.margin),
        height: Math.min(cfg.height, metadata.height - cfg.margin)
      };
  
      // Expand rect to avoid visible seam
      rect.left = Math.max(0, rect.left - cfg.expand);
      rect.top = Math.max(0, rect.top - cfg.expand);
      rect.width = Math.min(metadata.width - rect.left, rect.width + cfg.expand * 2);
      rect.height = Math.min(metadata.height - rect.top, rect.height + cfg.expand * 2);
  
      // Determine sample region (just above rect). If there's not enough space, sample to the right.
      let sample = null;
      const sampleSize = Math.min(cfg.sampleSize, metadata.width, metadata.height);
  
      // Try sample above watermark
      if (rect.top - sampleSize - 2 >= 0) {
        sample = {
          left: rect.left,
          top: Math.max(0, rect.top - sampleSize - 2),
          width: Math.min(sampleSize, metadata.width - rect.left),
          height: Math.min(sampleSize, rect.top)
        };
      } else if (rect.left + rect.width + sampleSize + 2 <= metadata.width) {
        // fallback: sample to the right of watermark
        sample = {
          left: rect.left + rect.width + 2,
          top: rect.top,
          width: Math.min(sampleSize, metadata.width - (rect.left + rect.width + 2)),
          height: Math.min(sampleSize, metadata.height - rect.top)
        };
      } else {
        // last fallback: small sample inside rect's top-right corner (may not be ideal)
        sample = {
          left: Math.max(0, rect.left + Math.floor(rect.width / 2) - Math.floor(sampleSize / 2)),
          top: Math.max(0, rect.top - sampleSize - 2),
          width: Math.min(sampleSize, metadata.width),
          height: Math.min(sampleSize, metadata.height)
        };
      }
  
      let fillColor = cfg.backgroundColor || '#FFFFFF';
  
      try {
        // Extract sample, resize to 1x1 to get average color
        const sampleBuffer = await img
          .clone()
          .extract({
            left: Math.max(0, Math.floor(sample.left)),
            top: Math.max(0, Math.floor(sample.top)),
            width: Math.max(1, Math.floor(sample.width)),
            height: Math.max(1, Math.floor(sample.height))
          })
          .resize(1, 1)
          .raw()
          .toBuffer();
  
        // sampleBuffer contains pixel channels (r,g,b,(a?))
        const channels = sampleBuffer.length;
        const r = sampleBuffer[0] ?? 255;
        const g = sampleBuffer[1] ?? 255;
        const b = sampleBuffer[2] ?? 255;
        // ignore alpha channel if present
  
        fillColor = `rgb(${r},${g},${b})`;
        // If nearly white, normalize to pure white (helps when background is mostly white but has noise)
        const isNearWhite = r > 240 && g > 240 && b > 240;
        if (isNearWhite) fillColor = '#FFFFFF';
      } catch (sampleErr) {
        console.warn('[Image Processor] Sampling background failed, using fallback color:', sampleErr.message);
        fillColor = cfg.backgroundColor || '#FFFFFF';
      }
  
      // Create an SVG overlay the size of the image, drawing a rectangle at rect coordinates with the sampled color
      const svg = `
        <svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
          <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="${fillColor}" />
        </svg>
      `;
  
      // Composite with 'over' so rectangle is painted ON TOP of the image
      let composed = await img
        .composite([
          { input: Buffer.from(svg), blend: 'over' }
        ])
        .toBuffer();
  
      // Optionally blur slightly to blend seam if requested
      if (cfg.blur && cfg.blur > 0) {
        composed = await sharp(composed).blur(cfg.blur).toBuffer();
      }
  
      console.log('[Image Processor] Watermark removed successfully (overlay).');
      return composed;
    } catch (error) {
      console.error(`[Image Processor] Failed to remove watermark (improved): ${error.message}`);
      // Fallback to original image on error
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