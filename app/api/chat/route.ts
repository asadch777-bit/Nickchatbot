import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/chatbot';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  console.log('[API] POST /api/chat called');

  try {
    const body = await request.json();
    const { message, sessionId } = body ?? {};

    if (!message || typeof message !== 'string') {
      console.error('[API] Invalid message payload');
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    console.log('[API] Processing message:', message.slice(0, 50));

    const response = await processChatMessage(
      message,
      sessionId || 'default'
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Fatal error in /api/chat');

    if (error instanceof Error) {
      console.error('[API] Error message:', error.message);
      console.error('[API] Error stack:', error.stack);
    } else {
      console.error('[API] Unknown error:', error);
    }

    return NextResponse.json(
      {
        response:
          'Sorry, something went wrong. Please try again later.',
        showOptions: false,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'Gtech Chatbot API (NICK)',
  });
}
