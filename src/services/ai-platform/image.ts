import 'server-only';

import {
  generateImageStudioAsset,
  getImageStudioCapabilities,
  listImageStudioAssets,
} from '@/ai/studio';
import type { ImageGenerationInput, ImageGenerationResult, ImageAssetRecord } from '@/ai/studio/types';

export async function generateManagedImage(input: ImageGenerationInput): Promise<ImageGenerationResult> {
  return generateImageStudioAsset(input);
}

export async function listManagedImages(ownerId: string, limit = 12): Promise<ImageAssetRecord[]> {
  return listImageStudioAssets(ownerId, limit);
}

export function getManagedImageCapabilities() {
  return getImageStudioCapabilities();
}
