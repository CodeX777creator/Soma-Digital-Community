import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { deleteEvent, getEventById, updateEvent } from '@/events';
import { EventValidationError } from '@/events/validation';

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, 'admin');
  const params = await context.params;
  const eventId = params.eventId;

  if (!eventId || eventId.length > 160) {
    return apiError('Invalid event.', { status: 400, code: 'INVALID_EVENT_ID' });
  }

  if (req.method === 'GET') {
    const event = await getEventById(eventId, { tier: 'elite', isAdmin: true });
    if (!event) return apiError('Event not found.', { status: 404, code: 'EVENT_NOT_FOUND' });
    return apiResponse({ event });
  }

  if (req.method === 'DELETE') {
    await deleteEvent(eventId);
    return apiResponse({ deleted: true });
  }

  try {
    const body = await req.json();
    const event = await updateEvent(eventId, body, entitlements.uid);
    return apiResponse({ event });
  } catch (error) {
    if (error instanceof EventValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    if (error instanceof Error && error.message === 'Event not found') {
      return apiError('Event not found.', { status: 404, code: 'EVENT_NOT_FOUND' });
    }
    throw error;
  }
});

export const GET = handler;
export const PATCH = handler;
export const DELETE = handler;
