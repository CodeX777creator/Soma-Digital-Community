import type {Metadata, Viewport} from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: 'Soma Digital Community | AI-Powered Business Growth',
  description: 'The premier community for digital entrepreneurs. AI coaching, networking, and exclusive business resources.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://soma-platform.com'),
  openGraph: {
    title: 'Soma Digital Community | AI-Powered Business Growth',
    description: 'The premier community for digital entrepreneurs. AI coaching, networking, and exclusive business resources.',
    type: 'website',
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
        <link rel="preload" href="/icon-192x192.png" as="image" type="image/png" />
      </head>
      <body className="font-body antialiased bg-background text-foreground overflow-x-hidden min-h-screen">
        <AuthProvider>
          <PayPalProvider nonce={nonce}>
            <NetworkStatusIndicator />
            {children}
            <Toaster />
            <SpeedInsights />
            <ServiceWorkerRegistration />
            <PwaInstallPrompt />
            <SystemUpdatePrompt />
          </PayPalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
