/**
 * Embedding service using Google Gemini Embedding API
 * 
 * Direct API calls (no gateway costs)
 * Free tier: 15 RPM, 1,500 requests/day
 * Uses batch endpoint for efficiency
 * 
 * Model: gemini-embedding-001 (recommended, has free tier)
 * Note: text-embedding-004 deprecated Jan 14, 2026
 */

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(message: string, retryAfter: number = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Generate embedding for a single text using Google Gemini API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set.');
  }

  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text input is required and must be a non-empty string');
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            parts: [
              {
                text: text.trim()
              }
            ]
          }
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      
      // Detect "limit: 0" error (free tier not enabled in Google Cloud)
      const quotaDetails = errorData.error?.details?.find(
        (d: { '@type'?: string }) => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure'
      ) as { violations?: Array<{ quotaMetric?: string }> } | undefined;
      const hasZeroLimit = quotaDetails?.violations?.some(
        (v: { quotaMetric?: string }) => v.quotaMetric?.includes('free_tier') && errorMessage.includes('limit: 0')
      );
      
      console.error('Embedding API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error,
        url: `models/${embeddingModel}:embedContent`,
        hasZeroLimit
      });
      
      if (hasZeroLimit || (response.status === 429 && errorMessage.includes('limit: 0'))) {
        const helpfulError = new Error(
          `Free tier quota not enabled for ${embeddingModel}. ` +
          'To fix this:\n' +
          '1. Go to: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com\n' +
          '2. Click "Enable" to enable the Generative Language API\n' +
          '3. Wait a few minutes for the API to activate\n' +
          '4. Try your request again\n\n' +
          'Note: The free tier allows 1,500 embedding requests per day.'
        );
        (helpfulError as Error & { isQuotaNotEnabled?: boolean }).isQuotaNotEnabled = true;
        throw helpfulError;
      }
      
      throw new Error(`Embedding failed: ${errorMessage}`);
    }

    const data = await response.json();
    
    if (!data.embedding || !data.embedding.values || !Array.isArray(data.embedding.values)) {
      console.error('Invalid embedding response structure:', data);
      throw new Error('Invalid embedding response: missing embedding.values array');
    }
    
    return data.embedding.values;
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    
    // Re-throw helpful quota errors first
    if (error instanceof Error && (error as Error & { isQuotaNotEnabled?: boolean }).isQuotaNotEnabled) {
      throw error;
    }
    
    // Handle quota/rate limit errors
    if (err?.status === 403 || err?.status === 429) {
      const errorMsg = err?.message || '';
      if (errorMsg.includes('limit: 0') || (errorMsg.includes('quota') && errorMsg.includes('free_tier'))) {
        if (error instanceof Error && error.message.includes('Free tier quota not enabled')) {
          throw error;
        }
        const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
        throw new Error(
          `Free tier quota not enabled for ${embeddingModel}. ` +
          'To fix this:\n' +
          '1. Go to: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com\n' +
          '2. Click "Enable" to enable the Generative Language API\n' +
          '3. Wait a few minutes for the API to activate\n' +
          '4. Try your request again\n\n' +
          'Note: The free tier allows 1,500 embedding requests per day.'
        );
      }
    }
    
    if (err?.status === 429 && !err?.message?.includes('limit: 0')) {
      throw new RateLimitError(
        'Gemini API rate limit exceeded. Please try again later.',
        60
      );
    }
    
    if (err?.status === 403 || (err?.message?.includes('quota') && !err?.message?.includes('limit: 0'))) {
      throw new Error('Gemini API quota exceeded. Please check your API key limits.');
    }
    
    if (error instanceof Error) {
      throw error;
    }
    
    console.error('Embedding generation error:', error);
    throw new Error(
      `Failed to generate embedding: ${err?.message || 'Unknown error'}`
    );
  }
}

/**
 * Generate embeddings for multiple texts using Google's Batch REST API
 * 
 * CRITICAL: Uses 1 API call for up to 100 documents instead of 100 individual calls
 * This prevents hitting the 15 RPM limit during initialization
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is missing');
  }

  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts array is required and must not be empty');
  }

  const validTexts = texts.filter(t => t && typeof t === 'string' && t.trim().length > 0);
  if (validTexts.length === 0) {
    throw new Error('No valid text inputs provided');
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: validTexts.map(t => ({
            // Batch endpoint requires model in EACH request object (not just URL)
            model: `models/${embeddingModel}`,
            content: {
              parts: [{ text: t.trim() }]
            }
          }))
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      console.error('Batch Embedding API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error,
        requestCount: validTexts.length
      });
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new RateLimitError(
          'Gemini API rate limit exceeded. Please try again later.',
          retryAfter ? parseInt(retryAfter, 10) : 60
        );
      }
      
      if (response.status === 403) {
        throw new Error('Gemini API quota exceeded. Please check your API key limits.');
      }
      
      throw new Error(
        `Batch embedding failed: ${response.status} ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      console.error('Invalid batch embedding response structure:', data);
      throw new Error('Invalid batch embedding response: missing embeddings array');
    }
    
    const results = data.embeddings.map((e: { values?: number[] }, index: number) => {
      if (!e || !e.values || !Array.isArray(e.values)) {
        console.error(`Invalid embedding at index ${index}:`, e);
        throw new Error(`Invalid embedding at index ${index}: missing values array`);
      }
      return e.values;
    });
    
    if (results.length !== validTexts.length) {
      console.warn(`Expected ${validTexts.length} embeddings but got ${results.length}`);
    }
    
    return results;
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    
    if (error instanceof Error) {
      throw error;
    }
    
    const err = error as { message?: string };
    console.error('Batch embedding error:', error);
    throw new Error(
      `Failed to generate embeddings: ${err?.message || 'Unknown error'}`
    );
  }
}

/**
 * Generate a hash of portfolio content for version checking
 * Uses Web Crypto API (Edge-compatible)
 */
export async function generatePortfolioHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
