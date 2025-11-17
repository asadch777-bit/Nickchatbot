import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/chatbot';

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const response = await processChatMessage(message, sessionId || 'default');

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { 
        response: 'Sorry, I encountered an error. Please try again later or contact support at support@gtech.co.uk',
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Gtech Chatbot API - NICK',
    status: 'online'
  });
}

