import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { EventRsvpError, listEventRsvps } from '@/events';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const params = await context.params;
  const eventId = params.eventId;

  if (!eventId || eventId.length > 160) {
    return apiError('Invalid event.', { status: 400, code: 'INVALID_EVENT_ID' });
  }

  try {
    const attendees = await listEventRsvps(eventId);
    return apiResponse({ attendees });
  } catch (error) {
    if (error instanceof EventRsvpError) {
      return apiError(error.message, { status: 404, code: error.code });
    }
    throw error;
  }
});

export const GET = handler;
