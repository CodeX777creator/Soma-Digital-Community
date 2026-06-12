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

const AIChatOutputSchema = z.string();

export async function aiMentorChat(input: z.infer<typeof AIChatInputSchema>): Promise<string> {
  const { text } = await ai.generate({
    model: 'kimi',
    messages: [
      { 
        role: 'system', 
        content: [{ text: `You are the Soma Digital AI Coach. 
          User context:
          Goals: ${input.userGoals || 'Not set'}
          Skill Level: ${input.skillLevel || 'Not set'}` 
        }] 
      },
      ...input.history.map(m => ({ 
        role: m.role as any, 
        content: [{ text: m.content }] 
      })),
      { 
        role: 'user', 
        content: [{ text: input.message }] 
      }
    ],

  });
  
  return text || "I'm sorry, I couldn't process that.";
}
