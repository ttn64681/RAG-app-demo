import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { searchSimilarDocuments } from '@/lib/vector-store';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/embeddings';

// Edge Runtime gives us 60s timeout instead of 10s (needed for streaming)
export const runtime = 'edge';

/**
 * Chat API endpoint with RAG (Retrieval-Augmented Generation)
 * 
 * Uses Vercel AI SDK library (free) but bypasses Vercel AI Gateway (paid service)
 * Direct Google API calls via SDK provider = zero gateway costs
 * 
 * Features:
 * - Rate limiting (10 requests/minute per IP)
 * - Auto-initializes embeddings if not found
 * - Auto-updates embeddings when portfolio changes
 * - Error handling for rate limits and API quotas
 * - Referer validation in production (prevents quota theft)
 */
export async function POST(req: Request) {
  try {
    // Rate limiting: 10 requests per minute per IP
    const clientId = getClientIdentifier(req);
    const rateLimit = await checkRateLimit(clientId, 10, 60);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please wait a moment before trying again.',
          retryAfter: rateLimit.retryAfter,
          resetAt: rateLimit.resetAt,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimit.retryAfter || 60),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.resetAt),
          },
        }
      );
    }

    const { messages } = await req.json();

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response('Invalid request', { status: 400 });
    }

    // AI SDK 6.0 uses 'parts' array instead of 'content' string
    // Extract text from parts, with fallbacks for legacy formats
    let queryText = '';
    if (lastMessage.content && typeof lastMessage.content === 'string') {
      queryText = lastMessage.content;
    } else if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
      const textParts = lastMessage.parts
        .filter((part: { type?: string; text?: string }) => part.type === 'text' && part.text)
        .map((part: { text: string }) => part.text);
      queryText = textParts.join('');
    } else if (lastMessage.text && typeof lastMessage.text === 'string') {
      queryText = lastMessage.text;
    }

    if (!queryText || queryText.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Message content is required and cannot be empty',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Production security: Block requests from unauthorized domains (prevents quota theft)
    if (process.env.NODE_ENV === 'production') {
      const referer = req.headers.get('referer');
      const allowedDomain = process.env.ALLOWED_DOMAIN || 'your-domain.vercel.app';
      
      if (!referer || !referer.includes(allowedDomain)) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // RAG: Search for relevant portfolio context
    // Auto-initializes embeddings if missing, auto-updates if portfolio changed
    const similarDocs = await searchSimilarDocuments(queryText.trim(), 3);

    // Build context from similar documents
    const context = similarDocs
      .map(({ document }) => document.content)
      .join('\n\n');

    // Build system message with RAG context
    const systemMessage = context
      ? `You are a helpful portfolio agent. Use the following context to answer questions about the portfolio. If the context doesn't contain relevant information, say so politely.

Context:
${context}

Answer the user's questions based on this context. Be friendly, concise, and professional. Keep responses under 200 words.`
      : 'You are a helpful portfolio agent. Answer questions about the portfolio in a friendly, concise, and professional manner. Keep responses under 200 words.';

    // Keep last 6 messages to save tokens and maintain context
    const recentMessages = messages.slice(-6).filter((msg: { role: string }) => msg.role !== 'system');

    // Transform messages: AI SDK 6.0 uses 'parts' array, but streamText expects 'content' string
    const transformedMessages = recentMessages.map((msg: {
      role: string;
      parts?: Array<{ type?: string; text?: string }>;
      content?: string;
      text?: string;
    }) => {
      // Extract text from parts array (AI SDK 6.0 format)
      let content = '';
      if (msg.parts && Array.isArray(msg.parts)) {
        const textParts = msg.parts
          .filter((part: { type?: string; text?: string }): part is { type: string; text: string } => 
            part.type === 'text' && typeof part.text === 'string'
          )
          .map((part) => part.text);
        content = textParts.join('');
      } else if (msg.content && typeof msg.content === 'string') {
        content = msg.content;
      } else if (msg.text && typeof msg.text === 'string') {
        content = msg.text;
      }

      return {
        role: msg.role,
        content: content,
      };
    }).filter((msg: { content: string }) => msg.content.trim().length > 0);

    if (transformedMessages.length === 0) {
      console.error('No valid messages after transformation');
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'No valid messages found after processing',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    try {
      const result = await streamText({
        model: google(modelName), // SDK auto-detects GOOGLE_GENERATIVE_AI_API_KEY from env
        system: systemMessage,
        messages: transformedMessages,
        temperature: 0.7,
      });

      // CRITICAL FIX: Must use toUIMessageStreamResponse() for useChat compatibility
      // toTextStreamResponse() doesn't work - messages won't appear in UI
      // This was the root cause of messages not showing up
      return result.toUIMessageStreamResponse();
    } catch (streamError) {
      console.error('streamText error:', streamError);
      throw streamError;
    }
  } catch (error) {
    console.error('Chat API error:', error);

    // Handle rate limit errors
    if (error instanceof RateLimitError) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: error.message,
          retryAfter: error.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(error.retryAfter),
          },
        }
      );
    }

    // Handle quota exceeded
    if (error instanceof Error && error.message.includes('quota')) {
      return new Response(
        JSON.stringify({
          error: 'Service unavailable',
          message: 'API quota exceeded. Please try again later.',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Generic error
    return new Response(
      JSON.stringify({
        error: 'Failed to generate response',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
