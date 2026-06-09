// PayPal API Types
export interface PayPalAccessTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
}

export interface PayPalSubscriptionLink {
  rel: string;
  href: string;
  method?: string;
}

export interface PayPalSubscriptionResponse {
  id: string;
  status: string;
  status_update_time?: string;
  links: PayPalSubscriptionLink[];
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  create_time: string;
  resource: {
    id: string;
    status?: string;
    start_time?: string;
    plan_id?: string;
  };
}

export interface PayPalVerificationResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}
