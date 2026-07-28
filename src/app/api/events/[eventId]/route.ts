import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { getSubscriptionPlan } from '@/lib/entitlements';
import { getEventById } from '@/events';

const handler = createAPIHandler(async (req, context) => {
  let viewer: { tier: ReturnType<typeof getSubscriptionPlan>; isAdmin: boolean; userId?: string } = {
    tier: 'explorer' as ReturnType<typeof getSubscriptionPlan>,
    isAdmin: false,
  };
  try {
    const entitlements = await requireUserEntitlements(req as any);
    viewer = {
      tier: getSubscriptionPlan(entitlements.subscription.subscriptionPlan),
      isAdmin: entitlements.isAdmin,
      userId: entitlements.uid,
    };
  } catch {
    // Public event details are limited to the Explorer visibility boundary.
  }
  const params = await context.params;
  const eventId = params.eventId;

  if (!eventId || eventId.length > 160) {
    return apiError('Invalid event.', { status: 400, code: 'INVALID_EVENT_ID' });
  }

  const event = await getEventById(eventId, viewer);

  if (!event) {
    return apiError('Event not found.', { status: 404, code: 'EVENT_NOT_FOUND' });
  }

  return apiResponse({ event }, {
    cache: { private: true, maxAge: 30, staleWhileRevalidate: 60 },
  });
});

export const GET = handler;
