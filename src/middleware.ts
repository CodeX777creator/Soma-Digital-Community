import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Global routes that exist at the root level and should NEVER be prefixed
// by a subdomain rewrite — auth guards redirect to these paths, so
// prefixing them would create redirect loops (e.g. /marketplace/open).
const GLOBAL_ROUTES = [
  '/open',
  '/login',
  '/signup',
  '/terms',
  '/privacy',
  '/pricing',
  '/support',
  '/partners',
  '/blog',
  '/case-studies',
];

function isGlobalRoute(pathname: string): boolean {
  return GLOBAL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
}

function createContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const devScriptPolicy = isDev ? " 'unsafe-eval' 'unsafe-inline'" : '';

  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScriptPolicy} https://*.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://*.paystack.co https://js.stripe.com https://www.gstatic.com https://apis.google.com https://accounts.google.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https: https://res.cloudinary.com;
    font-src 'self';
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.cloudfunctions.net https://*.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://api.paystack.co https://api.moonshot.cn https://api.moonshot.ai wss://*.firebaseio.com;
    frame-src 'self' https://vercel.live/ https://*.firebaseapp.com https://*.web.app https://accounts.google.com https://apis.google.com https://*.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://*.paystack.co https://js.stripe.com;
    media-src 'self' blob: https://*.firebasestorage.app https://firebasestorage.googleapis.com https://res.cloudinary.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();
}

function createNonceRequestHeaders(request: NextRequest, cspHeader: string, nonce: string) {
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  return requestHeaders;
}

function setContentSecurityPolicy(response: NextResponse, cspHeader: string, nonce: string) {
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('x-nonce', nonce);

  return response;
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const cspHeader = createContentSecurityPolicy(nonce);
  const requestHeaders = createNonceRequestHeaders(request, cspHeader, nonce);

  // Skip static assets, Next.js internals, and API routes
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/static') ||
    url.pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Skip global routes — these should always resolve from the root regardless
  // of what subdomain the request came in on
  if (isGlobalRoute(url.pathname)) {
    return setContentSecurityPolicy(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      cspHeader,
      nonce
    );
  }

  // Detect subdomains for somatoday.com and localhost
  let subdomain = '';
  if (hostname.endsWith('.somatoday.com')) {
    subdomain = hostname.replace('.somatoday.com', '');
  } else if (hostname.endsWith('.localhost:3000')) {
    subdomain = hostname.replace('.localhost:3000', '');
  }

  if (subdomain) {
    // Rewrite /  (and any path not already prefixed) to the subdomain's section
    if (subdomain === 'admin') {
      if (!url.pathname.startsWith('/admin')) {
        url.pathname = `/admin${url.pathname === '/' ? '/dashboard' : url.pathname}`;
        return setContentSecurityPolicy(
          NextResponse.rewrite(url, {
            request: {
              headers: requestHeaders,
            },
          }),
          cspHeader,
          nonce
        );
      }
    } else if (subdomain === 'marketplace') {
      if (!url.pathname.startsWith('/marketplace')) {
        url.pathname = `/marketplace${url.pathname === '/' ? '' : url.pathname}`;
        return setContentSecurityPolicy(
          NextResponse.rewrite(url, {
            request: {
              headers: requestHeaders,
            },
          }),
          cspHeader,
          nonce
        );
      }
    } else if (subdomain === 'community') {
      if (!url.pathname.startsWith('/community')) {
        url.pathname = `/community${url.pathname === '/' ? '' : url.pathname}`;
        return setContentSecurityPolicy(
          NextResponse.rewrite(url, {
            request: {
              headers: requestHeaders,
            },
          }),
          cspHeader,
          nonce
        );
      }
    }
  }

  return setContentSecurityPolicy(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    cspHeader,
    nonce
  );
}
