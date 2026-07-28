import type {Metadata, Viewport} from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from '@/lib/seo/site';
import { JsonLd, organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from '@/lib/seo/structured-data';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | AI-Powered Business Growth`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: `${SITE_NAME} | AI-Powered Business Growth`,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | AI-Powered Business Growth`,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192x192.png',
    apple: '/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

import { AuthProvider } from '@/providers/AuthProvider';
import { PayPalProvider } from '@/providers/PayPalProvider';
import { NetworkStatusIndicator } from '@/components/ui/network-status';
import { Toaster } from '@/components/ui/toaster';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { SystemUpdatePrompt } from '@/components/SystemUpdatePrompt';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
      </head>
      <body className="font-body antialiased bg-background text-foreground min-h-screen">
            <AuthProvider>
          <PayPalProvider nonce={nonce}>
            <NetworkStatusIndicator />
            {children}
            <Toaster />
            <SpeedInsights />
            <ServiceWorkerRegistration />
            <PwaInstallPrompt />
            <SystemUpdatePrompt />
            <JsonLd data={[organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd()]} />
          </PayPalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
