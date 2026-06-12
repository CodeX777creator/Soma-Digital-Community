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
    
    // Ensure we return a valid HTTP status code (200-599)
    // Genkit errors may have string status like 'INVALID_ARGUMENT'
    let status = 500;
    if (typeof error?.status === 'number' && error.status >= 200 && error.status <= 599) {
      status = error.status;
    } else if (error?.code === 400 || error?.status === 'INVALID_ARGUMENT') {
      status = 400;
    } else if (error?.code === 401) {
      status = 401;
    } else if (error?.code === 403) {
      status = 403;
    }
    
    const message = error?.message || 'Internal server error';
    
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
