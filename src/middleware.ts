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

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';

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
    return NextResponse.next();
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
        return NextResponse.rewrite(url);
      }
    } else if (subdomain === 'marketplace') {
      if (!url.pathname.startsWith('/marketplace')) {
        url.pathname = `/marketplace${url.pathname === '/' ? '' : url.pathname}`;
        return NextResponse.rewrite(url);
      }
    } else if (subdomain === 'community') {
      if (!url.pathname.startsWith('/community')) {
        url.pathname = `/community${url.pathname === '/' ? '' : url.pathname}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  return NextResponse.next();
}
