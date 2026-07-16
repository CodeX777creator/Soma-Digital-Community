import crypto from 'crypto';
import { createSocialOAuthError } from '@/lib/errors/domain';
import type { EncryptedPayload, SocialCredentialPayload } from './types';

const KEY_VERSION: EncryptedPayload['keyVersion'] = 'v1';
const ALGORITHM: EncryptedPayload['algorithm'] = 'aes-256-gcm';
const IV_LENGTH = 12;

function decodeMasterKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const fromBase64 = Buffer.from(trimmed, 'base64');
  if (fromBase64.length === 32) {
    return fromBase64;
  }

  const fromUtf8 = Buffer.from(trimmed, 'utf8');
  if (fromUtf8.length === 32) {
    return fromUtf8;
  }

  throw createSocialOAuthError('SOCIAL_CREDENTIALS_MASTER_KEY_MISSING', { message: 'SOCIAL_CREDENTIALS_MASTER_KEY must decode to 32 bytes' });
}

function getMasterKey(): Buffer {
  const rawKey = process.env.SOCIAL_CREDENTIALS_MASTER_KEY;
  if (!rawKey || !rawKey.trim()) {
    throw createSocialOAuthError('SOCIAL_CREDENTIALS_MASTER_KEY_MISSING', { message: 'Missing SOCIAL_CREDENTIALS_MASTER_KEY' });
  }

  return decodeMasterKey(rawKey);
}

export function sealSocialPayload(payload: SocialCredentialPayload | Record<string, unknown>): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: ALGORITHM,
    keyVersion: KEY_VERSION,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function openSocialPayload<T extends Record<string, unknown>>(payload: EncryptedPayload): T {
  const decipher = crypto.createDecipheriv(
    payload.algorithm,
    getMasterKey(),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8')) as T;
}
