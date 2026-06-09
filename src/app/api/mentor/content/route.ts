import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { generateMentorContent } from '@/ai/flows/ai-mentor-content-gen-flow';

export async function POST(req: Request) {
  try {
    await requireSubscription(req as any, 'explorer');
    const body = await req.json();

    const content = await generateMentorContent({
      contentType: body.contentType || 'ad_copy',
      businessContext: body.topic,
      targetAudience: body.audience,
    });

    return NextResponse.json({ content });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.status || 401 }
    );
  }
}
