import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    const { profile, subscription } = await requireSubscription(req as any, 'explorer');

    const xp = typeof profile.xp === 'number' ? profile.xp : 0;
    const streak = typeof profile.streak === 'number' ? profile.streak : 0;
    const goal = typeof profile.goal === 'string' ? profile.goal : null;

    return NextResponse.json({
      xp,
      level: Math.max(1, Math.floor(xp / 1000) + 1),
      streak,
      goal,
      subscription,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.status || 401 }
    );
  }
}
