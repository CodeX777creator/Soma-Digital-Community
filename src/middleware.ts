import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';

  // Exclude static assets and api routes
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/static') ||
    url.pathname.includes('.')
  ) {
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
    // Internal rewrites based on subdomain name
    if (subdomain === 'admin') {
      if (!url.pathname.startsWith('/admin')) {
        url.pathname = `/admin${url.pathname}`;
        return NextResponse.rewrite(url);
      }
    } else if (subdomain === 'marketplace') {
      if (!url.pathname.startsWith('/marketplace')) {
        url.pathname = `/marketplace${url.pathname}`;
        return NextResponse.rewrite(url);
      }
    } else if (subdomain === 'community') {
      if (!url.pathname.startsWith('/community')) {
        url.pathname = `/community${url.pathname}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  return NextResponse.next();
}
