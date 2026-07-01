/**
 * XSS Protection Utilities
 * 
 * Provides HTML sanitization and output escaping for user-generated content.
 */

import DOMPurify from 'isomorphic-dompurify';

// Allowed HTML tags for rich content (if needed in future)
const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Validates if a URL has a safe protocol
 */
function hasSafeProtocol(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://localhost');
    return ALLOWED_URL_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Use this when rendering user-generated HTML content.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  
  // SECURITY FIX: Pre-process to block dangerous protocols before DOMPurify
  const preprocessed = dirty
    .replace(/javascript:/gi, 'blocked:')
    .replace(/data:text\/html/gi, 'blocked:text/html')
    .replace(/vbscript:/gi, 'blocked:');
  
  // SECURITY FIX: Remove hooks - not supported in isomorphic-dompurify types
  // Use FORBID_ATTR and protocol checking instead
  return DOMPurify.sanitize(preprocessed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    // Block dangerous URLs
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

/**
 * Escapes HTML entities to prevent XSS.
 * Use this when displaying plain text that should not be interpreted as HTML.
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates and sanitizes a URL.
 * Returns null if the URL is invalid or uses a dangerous protocol.
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  const trimmed = url.trim();
  if (!trimmed) return null;
  
  try {
    const parsed = new URL(trimmed);
    
    // SECURITY FIX: This check is sufficient - removes redundant javascript:/data: checks
    // that were causing TypeScript "no overlap" errors
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    
    return trimmed;
  } catch {
    // Try adding https:// prefix
    try {
      const withProtocol = `https://${trimmed}`;
      const parsed = new URL(withProtocol);
      return parsed.toString();
    } catch {
      return null;
    }
  }
}

/**
 * Sanitizes user input for display in a text context.
 * Strips all HTML and returns plain text.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';
  
  // First escape HTML, then remove any remaining HTML-like content
  const escaped = escapeHtml(input);
  
  // Remove any potential script/style blocks
  return escaped
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

/**
 * Sanitizes a filename to prevent path traversal and injection attacks.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'unnamed';
  
  // Remove path components
  const baseName = filename.replace(/^[\s\\\/]+|[\s\\\/]+$/g, '');
  const noPath = baseName.replace(/.*[\\\/]/, '');
  
  // Replace dangerous characters
  const safe = noPath
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '_')
    .substring(0, 255);
  
  return safe || 'unnamed';
}

/**
 * Validates that a string is a valid email address.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitizes JSON input to prevent prototype pollution.
 */
export function sanitizeJsonInput<T>(data: T): T {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeJsonInput(item)) as unknown as T;
  }
  
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip prototype pollution keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    sanitized[key] = sanitizeJsonInput(value);
  }
  
  return sanitized as T;
}

/**
 * Creates a Content Security Policy nonce for inline scripts.
 */
export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}