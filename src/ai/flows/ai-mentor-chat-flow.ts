'use server';

import { ai, KIMI_MODELS } from '@/ai/genkit';
import { z } from 'genkit';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

const AIChatInputSchema = z.object({
  history: z.array(ChatMessageSchema),
  message: z.string(),
  userGoals: z.string().optional(),
  skillLevel: z.string().optional(),
});

export async function aiMentorChat(input: z.infer<typeof AIChatInputSchema>): Promise<string> {
  // Build conversation history as a text prompt
  const historyText = input.history
    .map(m => `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`)
    .join('\n\n');
  
  const systemPrompt = `You are the Soma Digital AI Coach. 
User context:
Goals: ${input.userGoals || 'Not set'}
Skill Level: ${input.skillLevel || 'Not set'}

${historyText ? 'Previous conversation:\n' + historyText + '\n\n' : ''}User: ${input.message}

AI:`;

  const { text } = await ai.generate({
    prompt: systemPrompt,
    config: {
      model: KIMI_MODELS.BALANCED,
    },
  });
  
  return text || "I'm sorry, I couldn't process that.";
}
