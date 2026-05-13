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
  prompt: `You are an expert AI business mentor on the "Legacy Hub" platform. Your role is to help new members create a personalized initial roadmap to achieve their business goals.

Based on the following business goals, create a structured, actionable, and personalized roadmap. The roadmap should consist of a title and a series of distinct steps, where each step has a title and a detailed description of the actions required.

Business Goals: {{{businessGoals}}}

Ensure the roadmap is realistic, strategic, and broken down into manageable stages. Focus on digital marketing, AI business, online income, entrepreneurship, branding, funnels, and the creator economy where applicable.`,
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
