import { getApps, getApp, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';

function getAdminApp() {
  return getApps().length ? getApp() : initializeApp();
}

function getSettings() {
  const retentionDays = Number(process.env.IMAGE_STORAGE_RETENTION_DAYS || '180');
  const enabled = process.env.IMAGE_STORAGE_LIFECYCLE_ENABLED === 'true';
  return {
    enabled,
    retentionDays: Number.isFinite(retentionDays) ? Math.max(30, Math.floor(retentionDays)) : 180,
    skipPublicAssets: process.env.IMAGE_STORAGE_LIFECYCLE_SKIP_PUBLIC !== 'false',
  };
}

async function readLifecycleConfig() {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('system').doc('config').get();
  const data = snapshot.data() as Record<string, unknown> | undefined;
  const lifecycle = (data?.aiStorageLifecycle as Record<string, unknown> | undefined) || {};

  const settings = getSettings();
  return {
    enabled: typeof lifecycle.enabled === 'boolean' ? lifecycle.enabled : settings.enabled,
    retentionDays: typeof lifecycle.retentionDays === 'number' ? Math.max(30, Math.floor(lifecycle.retentionDays)) : settings.retentionDays,
    skipPublicAssets: typeof lifecycle.skipPublicAssets === 'boolean' ? lifecycle.skipPublicAssets : settings.skipPublicAssets,
    maxDeletesPerRun: typeof lifecycle.maxDeletesPerRun === 'number' ? Math.max(1, Math.floor(lifecycle.maxDeletesPerRun)) : 50,
  };
}

async function deleteStoragePath(path: string): Promise<void> {
  if (!path) return;
  const bucket = getStorage(getAdminApp()).bucket();
  await bucket.file(path).delete({ ignoreNotFound: true });
}

export const cleanupStaleGeneratedAssets = onSchedule(
  { schedule: '15 3 * * 1', timeZone: 'UTC' },
  async () => {
    const settings = await readLifecycleConfig();
    if (!settings.enabled) {
      console.log('[storage-lifecycle] cleanup disabled');
      return;
    }

    const db = getFirestore(getAdminApp());
    const cutoff = Timestamp.fromMillis(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
    const snapshot = await db
      .collection('generatedAssets')
      .where('type', '==', 'image')
      .where('createdAt', '<=', cutoff)
      .limit(settings.maxDeletesPerRun)
      .get();

    if (snapshot.empty) {
      console.log('[storage-lifecycle] no stale image assets found');
      return;
    }

    for (const doc of snapshot.docs) {
      const asset = doc.data() as Record<string, unknown>;
      if (settings.skipPublicAssets && asset.visibility === 'public') {
        continue;
      }

      const storagePath = typeof asset.storagePath === 'string' ? asset.storagePath : '';
      try {
        await deleteStoragePath(storagePath);
        await doc.ref.delete();
        console.log('[storage-lifecycle] deleted stale asset', { assetId: doc.id, storagePath });
      } catch (error) {
        console.error('[storage-lifecycle] failed to delete stale asset', {
          assetId: doc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
);
