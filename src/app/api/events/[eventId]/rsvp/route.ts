import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { getSubscriptionPlan } from '@/lib/entitlements';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { cancelEventRsvp, EventRsvpError, rsvpToEvent } from '@/events';

function getStatusForError(error: EventRsvpError): number {
  if (error.code === 'EVENT_NOT_FOUND') return 404;
  if (error.code === 'EVENT_NOT_ACCESSIBLE') return 403;
  if (error.code === 'EVENT_NOT_OPEN') return 409;
  if (error.code === 'EVENT_FULL') return 409;
  return 400;
}

function getViewer(entitlements: Awaited<ReturnType<typeof requireUserEntitlements>>) {
  return {
    userId: entitlements.uid,
    tier: getSubscriptionPlan(entitlements.subscription.subscriptionPlan),
    isAdmin: entitlements.isAdmin,
  };
}

const postHandler = createAPIHandler(async (req, context) => {
  const entitlements = await requireUserEntitlements(req as any);
  const params = await context.params;
  const eventId = params.eventId;

  if (!eventId || eventId.length > 160) {
    return apiError('Invalid event.', { status: 400, code: 'INVALID_EVENT_ID' });
  }

  try {
    const result = await rsvpToEvent(eventId, getViewer(entitlements));
    return apiResponse(result);
  } catch (error) {
    if (error instanceof EventRsvpError) {
      return apiError(error.message, { status: getStatusForError(error), code: error.code });
    }
    throw error;
  }
});

const deleteHandler = createAPIHandler(async (req, context) => {
  const entitlements = await requireUserEntitlements(req as any);
  const params = await context.params;
  const eventId = params.eventId;

  if (!eventId || eventId.length > 160) {
    return apiError('Invalid event.', { status: 400, code: 'INVALID_EVENT_ID' });
  }

  try {
    const result = await cancelEventRsvp(eventId, getViewer(entitlements));
    return apiResponse(result);
  } catch (error) {
    if (error instanceof EventRsvpError) {
      return apiError(error.message, { status: getStatusForError(error), code: error.code });
    }
    throw error;
  }
});

export const POST = postHandler;
export const DELETE = deleteHandler;
