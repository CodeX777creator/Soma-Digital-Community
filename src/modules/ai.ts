import 'server-only';

import { recordUsage, getAnalytics, calculateCost, getRecommendations, checkBudget } from '@/ai/analytics';
import { generateStudioContent, generateMentorContent } from '@/ai/studio';
import { aiMentorChatEnhanced, aiMentorChatStream } from '@/ai/flows/ai-mentor-chat-flow-enhanced';
import { aiGatewayService, generateManagedImage, generateManagedVideo, generateManagedVoice } from '@/services/ai-platform';

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
      generateImage: generateManagedImage,
      generateVideo: generateManagedVideo,
      generateAudio: generateManagedVoice,
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
