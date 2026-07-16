'use client';

import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { ReactNode } from 'react';

interface PayPalProviderProps {
  children: ReactNode;
  nonce?: string;
}

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

export function PayPalProvider({ children, nonce }: PayPalProviderProps) {
  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID || '',
        components: 'buttons',
        vault: true,
        intent: 'subscription',
        dataCspNonce: nonce,
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}
