import FormData from 'form-data';
import axios from 'axios';
import { lookup as mimeLookup } from 'mime-types';
import imageProcessor from './image-processor.js';
import path from 'path';

function ensureExtension(filename, mime) {
  const ext = path.extname(filename);
  if (ext && ext.length > 1) return filename;
  const guessed = mimeLookup(mime) ? `.${mimeLookup(mime).split('/').pop()}` : '';
  return filename + guessed;
}

export async function uploadBufferToWPMedia({ buffer, filename, mimeType }) {
  const wpBase = process.env.WOOCOMMERCE_URL;
  const wpUser = (process.env.WP_API_USER || '').trim();
  const wpAppPass = (process.env.WP_API_APP_PASSWORD || '').trim();
  
  console.log('[DEBUG] WP user:', JSON.stringify(wpUser));
  console.log('[DEBUG] WP apppass length:', wpAppPass.length);
  console.log('[DEBUG] Auth header (base64):', Buffer.from(`${wpUser}:${wpAppPass}`).toString('base64'));
  

  if (!wpBase || !wpUser || !wpAppPass) {
    throw new Error('Missing WOOCOMMERCE_URL or WP_API_USER/WP_API_APP_PASSWORD in .env');
  }

  // Normalize filename & mime
  const contentType = mimeType || mimeLookup(filename) || 'image/jpeg';
  filename = ensureExtension(filename, contentType);

  const mediaUrl = `${wpBase.replace(/\/$/, '')}/wp-json/wp/v2/media`;

  const form = new FormData();
  // FormData append with proper filename and contentType
  form.append('file', buffer, {
    filename,
    contentType
  });
  form.append('title', filename);

  // Basic Auth header using WP Application Password
  const auth = Buffer.from(`${wpUser}:${wpAppPass}`).toString('base64');

  // IMPORTANT: get content-length so some security stacks don't reject chunked unknown length
  const getLength = () =>
    new Promise((resolve, reject) => {
      form.getLength((err, length) => {
        if (err) return reject(err);
        resolve(length);
      });
    });

  const length = await getLength();

  const headers = {
    ...form.getHeaders(),
    Authorization: `Basic ${auth}`,
    'Content-Length': length
  };

  try {
    const resp = await axios.post(mediaUrl, form, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000 // increase timeout for larger uploads
    });

    return {
      id: resp.data.id,
      source_url: resp.data.source_url,
      filename: resp.data.title?.rendered || filename
    };
  } catch (error) {
    const msg = error.response
      ? `WP Media upload failed (${error.response.status}): ${JSON.stringify(error.response.data)}`
      : error.message;
    throw new Error(msg);
  }
}

/**
 * Process an array of image URLs: download -> remove watermark -> upload to WP media
 * Returns array of uploaded media objects: [{ id, source_url, filename, originalUrl }]
 */
export async function processAndUploadImages(imageUrls = [], watermarkOptions = {}) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return [];

  const results = [];

  for (const [idx, img] of imageUrls.entries()) {
    // img may be string or object {src}
    const imageUrl = typeof img === 'string' ? img : img.src || img;
    try {
      // 1. Process (download + watermark removal)
      const processed = await imageProcessor.processProductImage(imageUrl, watermarkOptions);
      // processed: { buffer, filename, originalUrl }

      // 2. Upload to WP media
      const uploaded = await uploadBufferToWPMedia({
        buffer: processed.buffer,
        filename: processed.filename
      });

      results.push({
        id: uploaded.id,
        src: uploaded.source_url,
        filename: uploaded.filename,
        originalUrl: imageUrl
      });
      console.log(`[Image Uploader] Uploaded image ${idx + 1}/${imageUrls.length}: ${uploaded.source_url}`);
    } catch (err) {
      console.error(`[Image Uploader] Failed processing/uploading image (${imageUrl}): ${err.message}`);
      // fallback: keep original URL so product still has an image
      results.push({
        id: null,
        src: imageUrl,
        filename: imageUrl.split('/').pop(),
        originalUrl: imageUrl,
        error: err.message
      });
    }
  }

  return results;
}

export default {
  uploadBufferToWPMedia,
  processAndUploadImages
};
