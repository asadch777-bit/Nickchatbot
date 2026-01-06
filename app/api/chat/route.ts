import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/chatbot';

// Route segment config for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const revalidate = 0; // Never cache
export const fetchCache = 'force-no-store'; // Prevent all caching

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
  // CORS headers and aggressive cache prevention for Vercel
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Vercel-Cache': 'MISS',
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
    
    let response;
    try {
      response = await processChatMessage(message, sessionId || 'default');
    } catch (processError) {
      console.error('[API] Error in processChatMessage:', processError);
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
