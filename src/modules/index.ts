import 'server-only';

import { aiModule, createAIModule } from './ai';
import { socialModule, createSocialModule } from './social';
import { billingModule, createBillingModule } from './billing';
import { authModule, createAuthModule } from './auth';
import { storageModule, createStorageModule } from './storage';
import { schedulingModule, createSchedulingModule } from './scheduling';
import { getAdminAnalyticsDashboard } from './analytics';

export function createAppModules() {
  return {
    ai: createAIModule(),
    social: createSocialModule(),
    billing: createBillingModule(),
    auth: createAuthModule(),
    storage: createStorageModule(),
    scheduling: createSchedulingModule(),
    analytics: {
      getAdminAnalyticsDashboard,
    },
  };
}

export const appModules = {
  ai: aiModule,
  social: socialModule,
  billing: billingModule,
  auth: authModule,
  storage: storageModule,
  scheduling: schedulingModule,
  analytics: {
    getAdminAnalyticsDashboard,
  },
} as const;

