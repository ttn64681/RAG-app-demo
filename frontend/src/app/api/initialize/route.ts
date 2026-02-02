import { NextResponse } from 'next/server';
import { initializePortfolioData, areEmbeddingsInitialized, needsReembedding } from '@/lib/vector-store';

// Edge Runtime for better performance
export const runtime = 'edge';

/**
 * API route to initialize portfolio embeddings
 * 
 * ONE-TIME operation. Embeddings persist in Redis and don't need to be
 * re-initialized unless I update portfolio data.
 * 
 * App auto-initializes on first use if embeddings don't exist.
 * App auto-updates embeddings when portfolio.ts changes (version hashing).
 */
export async function POST() {
  try {
    // Check if already initialized and up-to-date
    const alreadyInitialized = await areEmbeddingsInitialized();
    const needsUpdate = await needsReembedding();
    
    if (alreadyInitialized && !needsUpdate) {
      return NextResponse.json({
        success: true,
        message: 'Embeddings already initialized and up-to-date. No action needed.',
        alreadyInitialized: true,
        needsUpdate: false,
      });
    }

    if (needsUpdate && alreadyInitialized) {
      console.log('Portfolio content changed. Re-embedding...');
    }

    // Initialize embeddings from portfolio.ts
    await initializePortfolioData();

    return NextResponse.json({
      success: true,
      message: needsUpdate 
        ? 'Portfolio embeddings updated successfully. They will persist in Redis.'
        : 'Portfolio embeddings initialized successfully. They will persist in Redis.',
      alreadyInitialized: alreadyInitialized,
      needsUpdate: needsUpdate,
    });
  } catch (error) {
    console.error('Initialization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize portfolio embeddings',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check initialization status
 */
export async function GET() {
  try {
    const isInitialized = await areEmbeddingsInitialized();
    const needsUpdate = await needsReembedding();
    
    return NextResponse.json({
      initialized: isInitialized,
      needsUpdate: needsUpdate,
      message: !isInitialized
        ? 'Embeddings not initialized. Call POST /api/initialize to set them up.'
        : needsUpdate
        ? 'Embeddings exist but portfolio content has changed. Call POST /api/initialize to update.'
        : 'Embeddings are initialized and up-to-date.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        initialized: false,
        needsUpdate: true,
        error: error instanceof Error ? error.message : 'Failed to check status',
      },
      { status: 500 }
    );
  }
}
