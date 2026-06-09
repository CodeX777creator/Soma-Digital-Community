import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { aiMentorChat } from '@/ai/flows/ai-mentor-chat-flow';

export async function POST(req: Request) {
  try {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const body = await req.json();

    if (typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json({ error: 'Missing message text' }, { status: 400 });
    }

    const response = await aiMentorChat({
      history: Array.isArray(body.history) ? body.history : [],
      message: body.message,
      userGoals: entitlements.profile.goal,
      skillLevel: entitlements.profile.skillLevel,
    });

    return NextResponse.json({ result: response });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.status || 401 }
    );
  }
}
