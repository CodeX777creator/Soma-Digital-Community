import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { generatePersonalizedRoadmap } from '@/ai/flows/ai-mentor-personalized-roadmap-flow';

export async function POST(req: Request) {
  try {
    const entitlements = await requireSubscription(req as any, 'pro');
    const body = await req.json();

    const roadmap = await generatePersonalizedRoadmap({
      businessGoals: body.goals ?? entitlements.profile.goal,
    });

    return NextResponse.json({ roadmap });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.status || 401 }
    );
  }
}
