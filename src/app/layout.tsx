import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soma Digital Community | AI-Powered Business Growth',
  description: 'The premier community for digital entrepreneurs. AI coaching, networking, and exclusive business resources.',
};

import { AuthProvider } from '@/providers/AuthProvider';
import { PayPalProvider } from '@/providers/PayPalProvider';

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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground overflow-x-hidden">
        <AuthProvider>
          <PayPalProvider>
            {children}
          </PayPalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
