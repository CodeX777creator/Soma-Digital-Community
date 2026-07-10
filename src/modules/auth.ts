import 'server-only';

import { requireAuth, requireRole, requireSubscription, requireUserEntitlements, hasAdminAccess } from '@/lib/serverAuth';

export function createAuthModule() {
  return {
    requireAuth,
    requireRole,
    requireSubscription,
    requireUserEntitlements,
    hasAdminAccess,
  };
}

export const authModule = createAuthModule();

