import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { admin, adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { requireSubscription } from '@/lib/serverAuth';
import { sanitizeString } from '@/lib/security';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function getExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,8}$/.test(fromName)) return fromName;
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/quicktime') return 'mov';
  return 'bin';
}

function getUploadKind(mimeType: string): 'image' | 'video' | null {
  if (ALLOWED_IMAGE_TYPES.has(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.has(mimeType)) return 'video';
  return null;
}

function getLimitForKind(kind: 'image' | 'video'): number {
  return kind === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}

function createAssetId(kind: 'image' | 'video'): string {
  return `${kind}_upload_${Date.now()}_${crypto.randomUUID().slice(0, 12)}`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T;
}

const handler = createAPIHandler(
  async (req) => {
    if (req.method !== 'POST') {
      return apiError('Method not allowed', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    }

    const entitlements = await requireSubscription(req as any, 'explorer');
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return apiError('Upload a valid image or video file.', { status: 400, code: 'FILE_REQUIRED' });
    }

    const mimeType = file.type;
    const kind = getUploadKind(mimeType);
    if (!kind) {
      return apiError('Only JPEG, PNG, WebP, GIF, MP4, WebM, and MOV files are supported.', {
        status: 400,
        code: 'UNSUPPORTED_FILE_TYPE',
      });
    }

    const maxBytes = getLimitForKind(kind);
    if (file.size > maxBytes) {
      return apiError(`${kind === 'image' ? 'Images' : 'Videos'} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`, {
        status: 400,
        code: 'FILE_TOO_LARGE',
      });
    }

    const titleInput = formData.get('title');
    const title = typeof titleInput === 'string' && titleInput.trim()
      ? sanitizeString(titleInput, 160)
      : sanitizeString(file.name.replace(/\.[^.]+$/, ''), 160) || `${kind} upload`;
    const assetId = createAssetId(kind);
    const extension = getExtension(file.name, mimeType);
    const storagePath = `studio/uploads/${entitlements.uid}/${kind}/${assetId}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const bucketFile = adminStorage.bucket().file(storagePath);

    await bucketFile.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          ownerId: entitlements.uid,
          assetId,
          source: 'uploaded',
        },
      },
      resumable: false,
    });

    await bucketFile.setMetadata({
      metadata: {
        firebaseStorageDownloadTokens: assetId,
        ownerId: entitlements.uid,
        assetId,
        source: 'uploaded',
      },
    });

    const [downloadUrl] = await bucketFile.getSignedUrl({
      action: 'read',
      expires: '03-01-2500',
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const record = stripUndefined({
      schemaVariant: kind === 'image' ? 'image-generation-v1' : 'video-generation-v1',
      assetId,
      ownerId: entitlements.uid,
      type: kind,
      title,
      prompt: 'Uploaded media asset',
      promptVersion: 'uploaded-v1',
      storagePath,
      thumbnail: kind === 'image' ? downloadUrl : '',
      posterFrameUrl: kind === 'video' ? '' : undefined,
      provider: 'user-upload',
      model: 'manual-upload',
      mimeType,
      fileName: sanitizeString(file.name, 180),
      fileSizeBytes: file.size,
      visibility: 'private',
      tags: ['uploaded'],
      checksum: '',
      status: 'completed',
      renderState: kind === 'video' ? 'completed' : undefined,
      downloadUrl,
      metadata: {
        source: 'uploaded',
        uploadedAt: Date.now(),
      },
      createdAt: now,
      updatedAt: now,
      createdBy: entitlements.uid,
      updatedBy: entitlements.uid,
      version: 1,
    });

    await adminDb.collection('generatedAssets').doc(assetId).set(record);

    return apiResponse({
      asset: {
        assetId,
        title,
        type: kind,
        status: 'completed',
        thumbnail: kind === 'image' ? downloadUrl : undefined,
        downloadUrl,
        mimeType,
      },
      limits: {
        imageMaxBytes: IMAGE_MAX_BYTES,
        videoMaxBytes: VIDEO_MAX_BYTES,
      },
    }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 120000,
  }
);

export const POST = handler;
