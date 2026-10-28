/**
 * Safe Logger Utility
 * Ensures sensitive data such as API secrets, passwords, tokens, and authorization headers
 * are NEVER logged to stdout, stderr, or log files.
 */

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'consumer_secret',
  'consumersecret',
  'consumer_key',
  'consumerkey',
  'wp_api_app_password',
  'app_password',
  'key',
  'apikey',
  'api_key',
  'bearer'
];

/**
 * Recursively sanitize objects to remove secret values
 * @param {*} data 
 * @returns {*} Sanitized copy
 */
export function sanitizeData(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Check for common auth header patterns
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/i, 'Bearer [REDACTED]');
    }
    if (/basic\s+[a-zA-Z0-9+\/=]+/i.test(data)) {
      return data.replace(/basic\s+[a-zA-Z0-9+\/=]+/i, 'Basic [REDACTED]');
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some(s => lowerKey.includes(s));
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }
    return sanitized;
  }

  return data;
}

export const logger = {
  info: (prefix, message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data !== null) {
      console.log(`[${timestamp}] [${prefix}] ${message}`, sanitizeData(data));
    } else {
      console.log(`[${timestamp}] [${prefix}] ${message}`);
    }
  },

  warn: (prefix, message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data !== null) {
      console.warn(`[${timestamp}] [${prefix}] WARN: ${message}`, sanitizeData(data));
    } else {
      console.warn(`[${timestamp}] [${prefix}] WARN: ${message}`);
    }
  },

  error: (prefix, message, error = null) => {
    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : (error ? String(error) : '');
    const sanitizedExtra = error && typeof error === 'object' && error.response
      ? { status: error.response.status, statusText: error.response.statusText }
      : null;

    console.error(`[${timestamp}] [${prefix}] ERROR: ${message}${errorMsg ? ` - ${errorMsg}` : ''}`, sanitizedExtra || '');
  }
};
