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
 * Removes watermark from bottom left corner of the image
 * Assumptions:
 * - Watermark is fixed size and position (bottom left)
 * - Background is white
 * - Image won't be cropped
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Watermark removal options
 * @returns {Promise<Buffer>} Processed image buffer
 */
export async function removeWatermark(imageBuffer, options = {}) {
    try {
        console.log('[Image Processor] Removing watermark...');
        
        // Default options for watermark (adjust these based on your actual watermark)
        const defaultOptions = {
            position: 'bottom-left',  // Watermark position
            width: 120,               // Watermark width in pixels
            height: 50,               // Watermark height in pixels
            margin: 10,               // Margin from edges in pixels
            backgroundColor: '#FFFFFF' // White background
        };
        
        const config = { ...defaultOptions, ...options };
        
        // Load image with sharp
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        
        // Calculate watermark rectangle position (bottom-left)
        const watermarkRect = {
            left: config.margin,
            top: metadata.height - config.height - config.margin,
            width: config.width,
            height: config.height
        };
        
        // Validate that watermark area is within image bounds
        if (watermarkRect.left < 0 || watermarkRect.top < 0 || 
            watermarkRect.left + watermarkRect.width > metadata.width ||
            watermarkRect.top + watermarkRect.height > metadata.height) {
            console.warn('[Image Processor] Watermark position out of bounds, adjusting...');
            
            // Adjust to fit within image
            watermarkRect.left = Math.max(config.margin, 0);
            watermarkRect.top = Math.max(metadata.height - config.height - config.margin, 0);
            watermarkRect.width = Math.min(config.width, metadata.width - watermarkRect.left);
            watermarkRect.height = Math.min(config.height, metadata.height - watermarkRect.top);
        }
        
        // Create SVG overlay to cover the watermark area
        const svgOverlay = Buffer.from(`
            <svg width="${metadata.width}" height="${metadata.height}">
                <rect x="${watermarkRect.left}" 
                      y="${watermarkRect.top}" 
                      width="${watermarkRect.width}" 
                      height="${watermarkRect.height}" 
                      fill="${config.backgroundColor}" 
                      opacity="1" />
            </svg>
        `);
        
        // Apply the overlay to cover watermark
        const processedBuffer = await image
            .composite([{ 
                input: svgOverlay, 
                blend: 'dest-over' 
            }])
            .toBuffer();
        
        console.log('[Image Processor] Watermark removed successfully');
        return processedBuffer;
        
    } catch (error) {
        console.error(`[Image Processor] Failed to remove watermark: ${error.message}`);
        // Return original image if processing fails
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