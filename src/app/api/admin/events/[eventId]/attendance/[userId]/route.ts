import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { EventRsvpError, markEventAttendance, removeEventAttendance } from '@/events';

function getStatusForError(error: EventRsvpError): number {
  if (error.code === 'EVENT_NOT_FOUND') return 404;
  if (error.code === 'EVENT_NOT_OPEN') return 409;
  return 400;
}

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, 'admin');
  const params = await context.params;
  const eventId = params.eventId;
  const userId = params.userId;

  if (!eventId || eventId.length > 160 || !userId || userId.length > 160) {
    return apiError('Invalid attendance target.', { status: 400, code: 'INVALID_ATTENDANCE_TARGET' });
  }

  try {
    if (req.method === 'DELETE') {
      const result = await removeEventAttendance(eventId, userId);
      return apiResponse(result);
    }

    const result = await markEventAttendance(eventId, userId, entitlements.uid);
    return apiResponse(result);
  } catch (error) {
    if (error instanceof EventRsvpError) {
      return apiError(error.message, { status: getStatusForError(error), code: error.code });
    }
    throw error;
  }
});

export const POST = handler;
export const DELETE = handler;
