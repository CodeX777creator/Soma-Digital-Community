'use client';

import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { ReactNode } from 'react';

interface PayPalProviderProps {
  children: ReactNode;
}

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

if (!PAYPAL_CLIENT_ID) {
  console.warn('NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set');
}

export function PayPalProvider({ children }: PayPalProviderProps) {
  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID || '',
        components: 'buttons',
        vault: true,
        intent: 'subscription',
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}
