'use server';

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
  void input;
  throw new Error('The legacy AI Mentor flow has been retired. Use /api/mentor/chat so Creator Credits, telemetry, and guardrails are enforced.');
}
