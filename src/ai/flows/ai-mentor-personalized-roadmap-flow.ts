'use server';
/**
 * @fileOverview An AI mentor agent that generates a personalized business roadmap.
 *
 * - generatePersonalizedRoadmap - A function that handles the generation of a personalized roadmap.
 * - BusinessGoalsInput - The input type for the generatePersonalizedRoadmap function.
 * - PersonalizedRoadmapOutput - The return type for the generatePersonalizedRoadmap function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const BusinessGoalsInputSchema = z.object({
  businessGoals: z.string().describe('The user\u2019s business goals and aspirations.'),
});
export type BusinessGoalsInput = z.infer<typeof BusinessGoalsInputSchema>;

const PersonalizedRoadmapOutputSchema = z.object({
  roadmapTitle: z.string().describe('A title for the personalized business roadmap.'),
  primaryOpportunity: z.string().describe('The single biggest business opportunity for the user.'),
  fastestRevenuePath: z.string().describe('The quickest way for the user to start earning income.'),
  recommendedContentStrategy: z.string().describe('How the user should approach content to grow their audience.'),
  monetizationStrategy: z.string().describe('Specific ways the user will turn their efforts into wealth.'),
  aiGrowthForecast: z.string().describe('How AI will accelerate their business over the next 12 months.'),
  thirtyDayExecutionPlan: z.array(
    z.object({
      day: z.string().describe('Day or period (e.g. Day 1-7)'),
      task: z.string().describe('The primary focus or task'),
      outcome: z.string().describe('The expected result')
    })
  ).describe('A structured 30-day plan.'),
  steps: z.array(
    z.object({
      title: z.string().describe('The title of a roadmap step.'),
      description: z
        .string()
        .describe('A detailed description of the action items and strategy for this roadmap step.'),
    })
  ).describe('An array of structured steps for the personalized roadmap.'),
});
export type PersonalizedRoadmapOutput = z.infer<typeof PersonalizedRoadmapOutputSchema>;

export async function generatePersonalizedRoadmap(
  input: BusinessGoalsInput
): Promise<PersonalizedRoadmapOutput> {
  return aiMentorPersonalizedRoadmapFlow(input);
}

const roadmapPrompt = ai.definePrompt({
  name: 'aiMentorPersonalizedRoadmapPrompt',
  input: { schema: BusinessGoalsInputSchema },
  output: { schema: PersonalizedRoadmapOutputSchema },
  prompt: `You are a high-level Digital Wealth Strategist for the "Soma Digital Community". You are a hybrid of a ChatGPT expert, a McKinsey consultant, and a startup incubator mentor.

Your mission is to generate a premium "Digital Wealth Roadmap" that is emotionally powerful, strategically sound, and highly actionable.

Based on the following user profile, generate a comprehensive roadmap:
User Profile: {{{businessGoals}}}

Please provide:
1. A compelling title for the roadmap.
2. The Primary Opportunity: A high-level strategic "Big Win".
3. Fastest Revenue Path: How they get paid immediately.
4. Recommended Content Strategy: How to build authority and traffic.
5. Monetization Strategy: The long-term wealth engine.
6. AI Growth Forecast: How AI specifically will multiply their efforts.
7. A 30-Day Execution Plan: Broken down into phases.
8. Core Strategic Steps: Deep dives into the architecture.

Maintain a tone that is futuristic, intelligent, and luxurious. Avoid generic advice; be specific to their skills and niche.`,
});

const aiMentorPersonalizedRoadmapFlow = ai.defineFlow(
  {
    name: 'aiMentorPersonalizedRoadmapFlow',
    inputSchema: BusinessGoalsInputSchema,
    outputSchema: PersonalizedRoadmapOutputSchema,
  },
  async (input) => {
    const { output } = await roadmapPrompt(input);
    return output!;
  }
);
