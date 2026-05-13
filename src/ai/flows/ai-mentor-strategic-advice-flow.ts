'use server';
/**
 * @fileOverview An AI mentor that provides strategic business advice.
 *
 * - aiMentorStrategicAdvice - A function that handles the strategic advice process.
 * - AIMentorStrategicAdviceInput - The input type for the aiMentorStrategicAdvice function.
 * - AIMentorStrategicAdviceOutput - The return type for the aiMentorStrategicAdvice function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AIMentorStrategicAdviceInputSchema = z.object({
  topic: z.string().describe('The specific business topic the user wants advice on, e.g., "marketing strategy", "fundraising", "customer acquisition".'),
  businessDescription: z.string().describe('A detailed description of the user\u2019s business.'),
  userGoals: z.string().describe('The user\u2019s goals for their business.'),
  currentChallenges: z.string().describe('Any current challenges the user is facing in their business.'),
});
export type AIMentorStrategicAdviceInput = z.infer<typeof AIMentorStrategicAdviceInputSchema>;

const AIMentorStrategicAdviceOutputSchema = z.object({
  strategicAdvice: z.string().describe('Detailed strategic advice based on the provided inputs.'),
  actionableSteps: z.array(z.string()).describe('A list of concrete, actionable steps the user can take.'),
  personalizedRoadmapAdjustments: z.string().describe('Suggestions for adjusting their current business roadmap.'),
});
export type AIMentorStrategicAdviceOutput = z.infer<typeof AIMentorStrategicAdviceOutputSchema>;

export async function aiMentorStrategicAdvice(input: AIMentorStrategicAdviceInput): Promise<AIMentorStrategicAdviceOutput> {
  return aiMentorStrategicAdviceFlow(input);
}

const aiMentorStrategicAdvicePrompt = ai.definePrompt({
  name: 'aiMentorStrategicAdvicePrompt',
  input: {schema: AIMentorStrategicAdviceInputSchema},
  output: {schema: AIMentorStrategicAdviceOutputSchema},
  prompt: `You are an AI-powered strategic business mentor, expert in digital marketing, AI business, online income, entrepreneurship, branding, funnels, and the creator economy. Your goal is to provide personalized, actionable strategic advice to entrepreneurs.

Based on the following information, provide strategic business advice, actionable steps, and personalized roadmap adjustments:

### Business Description:
{{{businessDescription}}}

### User Goals:
{{{userGoals}}}

### Current Challenges:
{{{currentChallenges}}}

### Topic for Advice:
{{{topic}}}

Please provide your advice in a structured JSON format, covering:
1.  A main strategic advice section.
2.  A list of actionable steps.
3.  Suggestions for personalized roadmap adjustments.
`,
});

const aiMentorStrategicAdviceFlow = ai.defineFlow(
  {
    name: 'aiMentorStrategicAdviceFlow',
    inputSchema: AIMentorStrategicAdviceInputSchema,
    outputSchema: AIMentorStrategicAdviceOutputSchema,
  },
  async (input) => {
    const {output} = await aiMentorStrategicAdvicePrompt(input);
    return output!;
  },
);
