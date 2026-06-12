import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { aiMentorChat } from '@/ai/flows/ai-mentor-chat-flow';

export async function POST(req: Request) {
  try {
    console.log('[API /mentor/chat] Received request');
    
    const entitlements = await requireSubscription(req as any, 'explorer');
    console.log('[API /mentor/chat] Auth successful for user:', entitlements.uid);
    
    const body = await req.json();
    console.log('[API /mentor/chat] Request body:', { 
      messageLength: body.message?.length, 
      historyLength: body.history?.length 
    });

    if (typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json({ error: 'Missing message text' }, { status: 400 });
    }

    console.log('[API /mentor/chat] Calling aiMentorChat...');
    const response = await aiMentorChat({
      history: Array.isArray(body.history) ? body.history : [],
      message: body.message,
      userGoals: entitlements.profile?.goal,
      skillLevel: entitlements.profile?.skillLevel,
    });
    console.log('[API /mentor/chat] aiMentorChat succeeded, response length:', response?.length);

    return NextResponse.json({ result: response });
  } catch (error: any) {
    console.error('[API /mentor/chat] Error:', error);
    console.error('[API /mentor/chat] Error details:', {
      message: error?.message,
      status: error?.status,
      stack: error?.stack,
    });
    
    // Return 500 for server errors, or the error's status if available
    const status = error?.status || 500;
    const message = error?.message || 'Internal server error';
    
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
