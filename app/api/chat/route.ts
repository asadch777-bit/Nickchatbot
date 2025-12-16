import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/chatbot';

// Route segment config for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  console.log('[API] POST handler called');
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('[API] JSON parse error:', jsonError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { 
          status: 400,
          headers: corsHeaders
        }
      );
    }
    
    console.log('[API] Request body parsed:', { hasMessage: !!body.message, hasSessionId: !!body.sessionId });
    
    const { message, sessionId } = body;

    if (!message || typeof message !== 'string') {
      console.error('[API] Invalid message');
      return NextResponse.json(
        { error: 'Message is required' },
        { 
          status: 400,
          headers: corsHeaders
        }
      );
    }

    console.log('[API] Processing message:', message.substring(0, 50));
    
    let response;
    try {
      response = await processChatMessage(message, sessionId || 'default');
      console.log('[API] Response generated successfully, returning...');
    } catch (processError) {
      console.error('[API] Error in processChatMessage:', processError);
      console.error('[API] Error type:', processError instanceof Error ? processError.constructor.name : typeof processError);
      console.error('[API] Error message:', processError instanceof Error ? processError.message : String(processError));
      console.error('[API] Error stack:', processError instanceof Error ? processError.stack : 'No stack trace');
      throw processError;
    }

    return NextResponse.json(response, {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('[API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        response: 'Sorry, I encountered an error. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error',
        showOptions: false
      },
      { 
        status: 500,
        headers: corsHeaders
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
    }
  });
}
