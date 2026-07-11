import 'server-only';

import {
  generateAudioStudioAsset,
  getAudioStudioCapabilities,
  listAudioStudioAssets,
} from '@/ai/studio';
import type { AudioAssetRecord, AudioGenerationInput, AudioGenerationResult } from '@/ai/studio/types';

export async function generateManagedVoice(input: AudioGenerationInput): Promise<AudioGenerationResult> {
  return generateAudioStudioAsset(input);
}

export async function listManagedVoices(ownerId: string, limit = 12): Promise<AudioAssetRecord[]> {
  return listAudioStudioAssets(ownerId, limit);
}

export function getManagedVoiceCapabilities() {
  return getAudioStudioCapabilities();
}
