import { createHmac, timingSafeEqual } from 'node:crypto';

const INTERNAL_TOKEN_PURPOSE = 'social-analytics-adapter-v1';

export function createInternalServiceToken(secret: string): string {
  return createHmac('sha256', secret).update(INTERNAL_TOKEN_PURPOSE).digest('hex');
}

export function isValidInternalServiceToken(secret: string, received: string | undefined): boolean {
  if (!secret || !received) return false;
  const expected = createInternalServiceToken(secret);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
