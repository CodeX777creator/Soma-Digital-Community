import 'server-only';

import {
  generateVideoStudioAsset,
  getVideoStudioCapabilities,
  listVideoStudioAssets,
} from '@/ai/studio';
import type { VideoAssetRecord, VideoGenerationInput, VideoGenerationResult } from '@/ai/studio/types';

export async function generateManagedVideo(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  return generateVideoStudioAsset(input);
}

export async function listManagedVideos(ownerId: string, limit = 12): Promise<VideoAssetRecord[]> {
  return listVideoStudioAssets(ownerId, limit);
}

export function getManagedVideoCapabilities() {
  return getVideoStudioCapabilities();
}
