/**
 * Security Utilities
 * 
 * Provides enhanced security features including:
 * - IP blocking for repeated violations
 * - Admin-specific rate limits
 * - Content-Type validation
 * - Security header helpers
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';
import crypto from 'crypto';

// IP blocking map for repeated violations
const blockedIPs = new Map<string, number>();
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hour block

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// Admin-specific stricter rate limits
export const ADMIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // Very strict for admin
};

// Sensitive operation rate limits
export const SENSITIVE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // Strict for sensitive operations
};

// Check if IP is blocked
export function isBlocked(identifier: string): boolean {
  const blockedUntil = blockedIPs.get(identifier);
  if (!blockedUntil) return false;
  
  if (Date.now() > blockedUntil) {
    blockedIPs.delete(identifier);
    return false;
  }
  return true;
}

// Block an identifier
export function blockIdentifier(identifier: string): void {
  blockedIPs.set(identifier, Date.now() + BLOCK_DURATION);
  logger.warn(`IP blocked due to rate limit violations`, { 
    identifier, 
    blockedUntil: new Date(Date.now() + BLOCK_DURATION).toISOString() 
  });
}

// Cleanup blocked IPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, blockedUntil] of blockedIPs.entries()) {
    if (now > blockedUntil) {
      blockedIPs.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

// Content-Type validation
const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
];

export function validateContentType(req: NextRequest): boolean {
  const contentType = req.headers.get('content-type') || '';
  
  // Allow requests without content-type (like GET requests)
  if (!contentType) return true;
  
  return ALLOWED_CONTENT_TYPES.some(type => contentType.includes(type));
}

export function requireContentType(req: NextRequest): NextResponse | null {
  if (!validateContentType(req)) {
    return NextResponse.json(
      { 
        error: 'Unsupported Content-Type',
        code: 'INVALID_CONTENT_TYPE',
        allowedTypes: ALLOWED_CONTENT_TYPES
      },
      { status: 415 }
    );
  }
  return null;
}

// Security headers for API responses
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  };
}

// Add security headers to response
export function withSecurityHeaders(response: NextResponse): NextResponse {
  const headers = getSecurityHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Validate request origin
export function validateOrigin(req: NextRequest, allowedOrigins: string[]): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  
  // If no origin/referer, might be a same-origin request
  if (!origin && !referer) return true;
  
  const checkUrl = origin || referer;
  if (!checkUrl) return false;
  
  try {
    const url = new URL(checkUrl);
    return allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const regex = new RegExp(allowed.replace('*', '.*'));
        return regex.test(url.hostname);
      }
      return url.hostname === allowed;
    });
  } catch {
    return false;
  }
}

// Input sanitization helpers
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function validateUUID(input: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(input);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Timestamp validation (prevent future dates)
export function validateTimestamp(timestamp: number, maxFutureMs = 60000): boolean {
  const now = Date.now();
  return timestamp <= now + maxFutureMs && timestamp >= 0;
}

// Request size validation
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB

export function validateRequestSize(req: NextRequest): boolean {
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    return !isNaN(size) && size <= MAX_REQUEST_SIZE;
  }
  return true;
}

// API key validation (for service-to-service communication)
export function validateApiKey(req: NextRequest, expectedKey: string): boolean {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return false;
  
  // Use timing-safe comparison
  try {
    const keyBuffer = Buffer.from(apiKey, 'utf8');
    const expectedBuffer = Buffer.from(expectedKey, 'utf8');
    
    if (keyBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(keyBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// Request signature validation (for webhooks)
export function validateRequestSignature(
  body: string,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(body, 'utf8')
      .digest('hex');
    
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// Nonce generation for replay protection
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Safe JSON parsing with size limit
export function safeJsonParse<T>(text: string, maxSize = 1024 * 1024): T | null {
  if (text.length > maxSize) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Path traversal prevention
export function sanitizePath(input: string): string {
  return input.replace(/\.\./g, '').replace(/\/+/g, '/').replace(/^\//, '');
}

// Prompt injection prevention for AI inputs
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:previous|above|prior)\s+instructions/gi,
  /disregard\s+(?:previous|above|prior)\s+instructions/gi,
  /forget\s+(?:previous|above|prior)\s+instructions/gi,
  /system\s*:/gi,
  /you\s+are\s+now/gi,
  /new\s+role\s*:/gi,
  /ignore\s+all\s+previous/gi,
  /act\s+as\s+/gi,
  /pretend\s+to\s+be/gi,
  /simulate\s+being/gi,
  /\[system\s+override\]/gi,
  /<system>/gi,
  /\{\{system\}\}/gi,
  /override\s+instructions/gi,
  /bypass\s+restrictions/gi,
  /hack\s+this\s+system/gi,
  /\[\/system\]/gi,
  /<\|system\|>/gi,
  /ignore\s+your\s+programming/gi,
  /do\s+anything\s+now/gi,
  /DAN\s*[:\s]/gi,
  /jailbreak/gi,
];

export function sanitizePromptInput(input: string): { sanitized: string; threats: string[] } {
  const threats: string[] = [];
  let sanitized = input;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(`Detected pattern: ${pattern.source}`);
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
  }

  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{\{/g, '\\{\\{')
    .replace(/\}\}/g, '\\}\\}')
    .replace(/\[system\]/gi, '[SYSTEM]')
    .replace(/\[\/system\]/gi, '[/SYSTEM]');

  return { sanitized, threats };
}

/**
 * Validates and sanitizes a URL string
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['https:', 'http:']): { valid: boolean; sanitized?: string } {
  try {
    const parsed = new URL(url);
    
    if (!allowedProtocols.includes(parsed.protocol)) {
      return { valid: false };
    }
    
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
        return { valid: false };
      }
    }
    
    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return { valid: false };
  }
}

/**
 * Sanitizes HTML content to prevent XSS
 * Use this for any user-generated content that might contain HTML
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validates origin header to prevent CSRF
 */
export function validateCsrfOrigin(req: NextRequest): { valid: boolean; error?: NextResponse } {
  const origin = req.headers.get('origin');
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://soma-digital-community.vercel.app',
    'http://localhost:3000',
  ].filter(Boolean);
  
  // Skip for same-origin requests (no origin header)
  if (!origin) {
    return { valid: true };
  }
  
  const isAllowed = allowedOrigins.some(allowed => 
    allowed && origin.startsWith(allowed)
  );
  
  if (!isAllowed) {
    return {
      valid: false,
      error: NextResponse.json(
        {
          error: 'Invalid origin',
          code: 'INVALID_ORIGIN',
        },
        { status: 403 }
      ),
    };
  }
  
  return { valid: true };
}

/**
 * Validates request body size
 */
export function validateBodySize(
  req: NextRequest,
  maxSizeBytes: number = 1024 * 1024 // 1MB default
): { valid: boolean; error?: NextResponse } {
  const contentLength = req.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSizeBytes) {
      return {
        valid: false,
        error: NextResponse.json(
          {
            error: 'Request body too large',
            code: 'PAYLOAD_TOO_LARGE',
            maxSize: maxSizeBytes,
          },
          { status: 413 }
        ),
      };
    }
  }
  
  return { valid: true };
}
