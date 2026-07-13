import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { sanitizeString } from '@/lib/security';

type GeneratedAssetSummary = {
  assetId: string;
  title: string;
  type: string;
  status: string;
  thumbnail?: string;
  downloadUrl?: string;
  mimeType?: string;
};

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '40');
  if (!Number.isFinite(value)) return 40;
  return Math.min(Math.max(Math.floor(value), 1), 80);
}

const handler = createAPIHandler(
  async (req) => {
    if (req.method !== 'GET') {
      return apiError('Method not allowed', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    }

    const entitlements = await requireSubscription(req as any, 'explorer');
    const limit = parseLimit(req);
    const snapshot = await adminDb
      .collection('generatedAssets')
      .where('ownerId', '==', entitlements.uid)
      .limit(limit)
      .get();

    const assets: GeneratedAssetSummary[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        assetId: typeof data.assetId === 'string' ? data.assetId : doc.id,
        title: typeof data.title === 'string' ? sanitizeString(data.title, 160) : 'Generated asset',
        type: typeof data.type === 'string' ? sanitizeString(data.type, 40) : 'unknown',
        status: typeof data.status === 'string' ? sanitizeString(data.status, 40) : 'unknown',
        thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : undefined,
        downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : undefined,
        mimeType: typeof data.mimeType === 'string' ? sanitizeString(data.mimeType, 120) : undefined,
      };
    });

    return apiResponse({ assets });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 30000,
  }
);

export const GET = handler;
