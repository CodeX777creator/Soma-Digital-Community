import {
  EVENT_STATUSES,
  EVENT_TIERS,
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  MEETING_PROVIDERS,
  type EventInput,
  type EventStatus,
  type EventTier,
  type EventType,
  type EventVisibility,
  type MeetingProvider,
} from './types';

export class EventValidationError extends Error {
  constructor(message: string, public readonly code = 'INVALID_EVENT') {
    super(message);
    this.name = 'EventValidationError';
  }
}

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === 'string' && (EVENT_STATUSES as readonly string[]).includes(value);
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

export function isMeetingProvider(value: unknown): value is MeetingProvider {
  return typeof value === 'string' && (MEETING_PROVIDERS as readonly string[]).includes(value);
}

export function isEventVisibility(value: unknown): value is EventVisibility {
  return typeof value === 'string' && (EVENT_VISIBILITIES as readonly string[]).includes(value);
}

export function isEventTier(value: unknown): value is EventTier {
  return typeof value === 'string' && (EVENT_TIERS as readonly string[]).includes(value);
}

export function sanitizeEventString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function sanitizeEventText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function parseEventDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EventValidationError(`${field} is required.`, 'EVENT_DATE_REQUIRED');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new EventValidationError(`${field} must be a valid date.`, 'EVENT_DATE_INVALID');
  }
  return parsed;
}

export function normalizeAllowedTiers(value: unknown, visibility: EventVisibility): EventTier[] {
  if (visibility === 'all') return ['explorer', 'pro', 'elite'];
  if (visibility === 'explorer') return ['explorer', 'pro', 'elite'];
  if (visibility === 'pro') return ['pro', 'elite'];
  if (visibility === 'elite') return ['elite'];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isEventTier)));
}

export function validateEventInput(input: EventInput, options: { partial?: boolean } = {}): void {
  const partial = options.partial === true;
  const title = sanitizeEventString(input.title, 160);
  const description = sanitizeEventText(input.description, 5000);

  if (!partial || input.title !== undefined) {
    if (!title) throw new EventValidationError('Event title is required.', 'EVENT_TITLE_REQUIRED');
  }

  if (!partial || input.description !== undefined) {
    if (!description) throw new EventValidationError('Event description is required.', 'EVENT_DESCRIPTION_REQUIRED');
  }

  if (!partial || input.startsAt !== undefined) {
    parseEventDate(input.startsAt, 'Event start time');
  }

  if (input.endsAt) {
    const startsAt = input.startsAt ? parseEventDate(input.startsAt, 'Event start time') : null;
    const endsAt = parseEventDate(input.endsAt, 'Event end time');
    if (startsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new EventValidationError('Event end time must be after the start time.', 'EVENT_END_BEFORE_START');
    }
  }

  if (input.status !== undefined && !isEventStatus(input.status)) {
    throw new EventValidationError('Unsupported event status.', 'EVENT_STATUS_INVALID');
  }

  if (input.eventType !== undefined && !isEventType(input.eventType)) {
    throw new EventValidationError('Unsupported event type.', 'EVENT_TYPE_INVALID');
  }

  if (input.meetingProvider !== undefined && !isMeetingProvider(input.meetingProvider)) {
    throw new EventValidationError('Unsupported meeting provider.', 'EVENT_MEETING_PROVIDER_INVALID');
  }

  if (input.visibility !== undefined && !isEventVisibility(input.visibility)) {
    throw new EventValidationError('Unsupported event visibility.', 'EVENT_VISIBILITY_INVALID');
  }

  if (input.capacity !== undefined && input.capacity !== null) {
    if (!Number.isFinite(input.capacity) || input.capacity < 1 || input.capacity > 100000) {
      throw new EventValidationError('Event capacity must be between 1 and 100000.', 'EVENT_CAPACITY_INVALID');
    }
  }
}
