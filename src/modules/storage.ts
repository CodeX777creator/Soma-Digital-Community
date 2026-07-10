import 'server-only';

import { uploadAvatar, uploadAsset } from '@/lib/storage';

export function createStorageModule() {
  return {
    uploadAvatar,
    uploadAsset,
  };
}

export const storageModule = createStorageModule();

