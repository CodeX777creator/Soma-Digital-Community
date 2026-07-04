import type {Metadata, Viewport} from 'next';
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
    icon: '/favicon.ico',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" 
          rel="stylesheet"
        />
        <link rel="preload" href="/favicon.ico" as="image" type="image/x-icon" />
      </head>
      <body className="font-body antialiased bg-background text-foreground overflow-x-hidden min-h-screen">
        <AuthProvider>
          <PayPalProvider>
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
