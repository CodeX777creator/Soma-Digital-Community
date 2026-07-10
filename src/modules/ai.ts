import 'server-only';

import { recordUsage, getAnalytics, calculateCost, getRecommendations, checkBudget } from '@/ai/analytics';
import { generateStudioContent, generateMentorContent, generateVideoStudioAsset, generateAudioStudioAsset, generateImageStudioAsset } from '@/ai/studio';
import { aiMentorChatEnhanced, aiMentorChatStream } from '@/ai/flows/ai-mentor-chat-flow-enhanced';
import { aiGatewayService } from '@/services/ai-platform';

export function createAIModule() {
  return {
    mentor: {
      chat: aiMentorChatEnhanced,
      stream: aiMentorChatStream,
    },
    gateway: aiGatewayService,
    studio: {
      generateContent: generateStudioContent,
      generateMentorContent,
      generateImage: generateImageStudioAsset,
      generateVideo: generateVideoStudioAsset,
      generateAudio: generateAudioStudioAsset,
    },
    analytics: {
      recordUsage,
      getAnalytics,
      calculateCost,
      getRecommendations,
      checkBudget,
    },
  };
}

export const aiModule = createAIModule();
