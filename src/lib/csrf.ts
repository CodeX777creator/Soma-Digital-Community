/**
 * CSRF Protection Utilities
 * 
 * Provides CSRF token generation and validation for API routes.
 * Uses double-submit cookie pattern combined with session tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const CSRF_TOKEN_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Set CSRF token cookie (HTTP-only, SameSite strict)
 */
export async function setCsrfCookie(): Promise<string> {
  const token = generateCsrfToken();
  const cookieStore = await cookies();
  
  cookieStore.set(CSRF_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CSRF_TOKEN_EXPIRY / 1000,
  });
  
  return token;
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_TOKEN_COOKIE)?.value || null;
}

/**
 * Clear CSRF token cookie
 */
export async function clearCsrfCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CSRF_TOKEN_COOKIE);
}

/**
 * Validate CSRF token from request header against cookie
 */
export async function validateCsrfToken(req: NextRequest): Promise<boolean> {
  // Skip CSRF validation for GET, HEAD, OPTIONS requests
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return true;
  }
  
  const headerToken = req.headers.get(CSRF_HEADER);
  const cookieToken = await getCsrfTokenFromCookie();
  
  if (!headerToken || !cookieToken) {
    return false;
  }
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    const headerBuffer = Buffer.from(headerToken, 'hex');
    const cookieBuffer = Buffer.from(cookieToken, 'hex');
    
    if (headerBuffer.length !== cookieBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(headerBuffer, cookieBuffer);
  } catch {
    return false;
  }
}

/**
 * Middleware to require CSRF token for state-changing operations
 */
export async function requireCsrfToken(req: NextRequest): Promise<NextResponse | null> {
  const isValid = await validateCsrfToken(req);
  
  if (!isValid) {
    return NextResponse.json(
      { 
        error: 'Invalid or missing CSRF token',
        code: 'CSRF_INVALID'
      },
      { status: 403 }
    );
  }
  
  return null;
}

/**
 * API Route wrapper that adds CSRF protection
 */
export function withCsrfProtection(
  handler: (req: NextRequest) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const csrfError = await requireCsrfToken(req);
    if (csrfError) {
      return csrfError;
    }
    return handler(req);
  };
}

/**
 * Generate a fresh CSRF token for forms
 * Call this in server components or API routes that serve forms
 */
export async function getCsrfToken(): Promise<string> {
  const existingToken = await getCsrfTokenFromCookie();
  if (existingToken) {
    return existingToken;
  }
  return setCsrfCookie();
}
