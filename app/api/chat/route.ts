import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/chatbot';

// Add runtime config for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST request received');
    
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[API] JSON parse error:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { message, sessionId } = body;

    if (!message || typeof message !== 'string') {
      console.error('[API] Missing or invalid message');
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    console.log('[API] Received message:', message.substring(0, 50));
    console.log('[API] OpenAI API Key exists:', !!(process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY));
    
    const response = await processChatMessage(message, sessionId || 'default');

    console.log('[API] Response generated successfully');
    
    return NextResponse.json(response, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[API] Error in chat API:', error);
    console.error('[API] Error details:', error instanceof Error ? error.message : String(error));
    console.error('[API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // More detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = {
      message: errorMessage,
      type: error instanceof Error ? error.constructor.name : typeof error,
    };
    
    console.error('[API] Full error object:', JSON.stringify(errorDetails, null, 2));
    
    return NextResponse.json(
      { 
        response: 'Sorry, I encountered an error. Please try again later or contact support at support@gtech.co.uk',
        error: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error',
        showOptions: false
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Gtech Chatbot API - NICK',
    status: 'online'
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

