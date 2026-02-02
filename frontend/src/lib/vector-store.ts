import { redis } from './redis';
import { generateEmbedding, generateEmbeddings, generatePortfolioHash } from './embeddings';
import { portfolioDocuments } from '@/data/portfolio';

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Check if portfolio embeddings are already initialized in Redis
 */
export async function areEmbeddingsInitialized(): Promise<boolean> {
  try {
    // Note: Upstash uses lowercase method names (smembers, not sMembers)
    const docIds = await redis.smembers('documents:ids');
    return docIds.length > 0;
  } catch (error) {
    console.error('Error checking embeddings:', error);
    return false;
  }
}

/**
 * Get current portfolio hash from Redis
 */
async function getPortfolioHash(): Promise<string | null> {
  try {
    return await redis.get('portfolio:hash');
  } catch (error) {
    console.error('Error getting portfolio hash:', error);
    return null;
  }
}

/**
 * Check if portfolio needs re-embedding by comparing hashes
 */
export async function needsReembedding(): Promise<boolean> {
  try {
    const portfolioContent = JSON.stringify(portfolioDocuments);
    const currentHash = await generatePortfolioHash(portfolioContent);
    const storedHash = await getPortfolioHash();
    return !storedHash || storedHash !== currentHash;
  } catch (error) {
    console.error('Error checking portfolio hash:', error);
    return true; // If error, assume needs re-embedding
  }
}

/**
 * Store documents using batch embeddings and Redis pipeline
 * Batch embeddings = 1 API call for all docs (stays under 15 RPM limit)
 * Pipeline = 1 network round trip for all Redis commands (saves on 10k/day limit)
 */
async function storeDocuments(docs: Document[]): Promise<void> {
  console.log(`Generating embeddings for ${docs.length} documents...`);
  const embeddings = await generateEmbeddings(docs.map((d) => d.content));
  
  const pipeline = redis.pipeline();
  
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const key = `embedding:${doc.id}`;
    
    pipeline.set(
      key,
      JSON.stringify({
        embedding: embeddings[i],
        metadata: doc.metadata || {},
        docId: doc.id,
      })
    );
    pipeline.sadd('documents:ids', doc.id);
  }
  
  await pipeline.exec();
  
  // Store hash to detect portfolio changes (triggers auto-re-embedding)
  const portfolioContent = JSON.stringify(docs);
  const hash = await generatePortfolioHash(portfolioContent);
  await redis.set('portfolio:hash', hash);
}

/**
 * Get document content from portfolio data (stored in code)
 */
function getDocumentContent(docId: string): string | null {
  const doc = portfolioDocuments.find((d) => d.id === docId);
  return doc?.content || null;
}

/**
 * Search for similar documents using cosine similarity
 * 
 * Uses Redis pipeline for batch GET (saves commands)
 * Only embeddings stored in Redis, content retrieved from code (saves storage)
 * Query embeddings cached for 24h (prevents duplicate API calls)
 */
export async function searchSimilarDocuments(
  query: string,
  limit: number = 5
): Promise<Array<{ document: Document; score: number }>> {
  // Auto-initialize if embeddings don't exist
  const isInitialized = await areEmbeddingsInitialized();
  if (!isInitialized) {
    console.log('Embeddings not found. Auto-initializing...');
    await initializePortfolioData();
  }
  
  // Auto-update if portfolio content changed
  const needsUpdate = await needsReembedding();
  if (needsUpdate) {
    console.log('Portfolio content changed. Re-embedding...');
    await initializePortfolioData();
  }

  // Cache query embeddings - identical queries reuse cached embedding (24h TTL)
  const queryHash = await generatePortfolioHash(query.trim().toLowerCase());
  const queryCacheKey = `query:embedding:${queryHash}`;
  let queryEmbedding: number[];
  
  try {
    const cachedEmbedding = await redis.get(queryCacheKey);
    if (cachedEmbedding && typeof cachedEmbedding === 'string') {
      queryEmbedding = JSON.parse(cachedEmbedding);
      console.log('Using cached query embedding');
    } else {
      console.log('Generating new query embedding...');
      queryEmbedding = await generateEmbedding(query);
      await redis.set(queryCacheKey, JSON.stringify(queryEmbedding), { ex: 86400 });
      console.log('Query embedding cached for 24 hours');
    }
  } catch (error) {
    // CRITICAL: Never retry embedding generation - it will fail again and cause duplicate API calls
    // This prevents double billing and rate limit hits
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes('quota') ||
        errorMsg.includes('rate limit') ||
        errorMsg.includes('limit: 0') ||
        errorMsg.includes('free tier') ||
        errorMsg.includes('429') ||
        errorMsg.includes('403')
      ) {
        throw error;
      }
      console.error('Query embedding generation failed:', error.message);
      throw error;
    }
    throw error;
  }
  
  const docIds = await redis.smembers('documents:ids');
  
  if (docIds.length === 0) {
    throw new Error('No portfolio embeddings found.');
  }

  // Use pipeline to batch GET all embeddings (1 network round trip instead of N)
  const pipeline = redis.pipeline();
  for (const docId of docIds) {
    pipeline.get(`embedding:${docId}`);
  }
  const results = await pipeline.exec();

  const similarities: Array<{ document: Document; score: number }> = [];

  // Calculate cosine similarity for each document
  // Handle both string (raw) and object (auto-parsed) from Upstash
  for (let i = 0; i < docIds.length; i++) {
    const docId = docIds[i];
    const rawData = results?.[i];

    if (!rawData) continue;

    let parsed: { embedding: number[]; metadata?: Record<string, unknown>; docId?: string };

    if (typeof rawData === 'string') {
      try {
        parsed = JSON.parse(rawData) as { embedding: number[]; metadata?: Record<string, unknown>; docId?: string };
      } catch (e) {
        console.error(`Failed to parse embedding for ${docId}`, e);
        continue;
      }
    } else {
      parsed = rawData as { embedding: number[]; metadata?: Record<string, unknown>; docId?: string };
    }

    if (!parsed || !Array.isArray(parsed.embedding)) continue;

    const similarity = cosineSimilarity(queryEmbedding, parsed.embedding);
    
    // Content retrieved from code, not Redis (saves storage)
    const content = getDocumentContent(docId);
    if (!content) continue;

    similarities.push({
      document: {
        id: docId,
        content,
        metadata: parsed.metadata,
      },
      score: similarity,
    });
  }

  return similarities
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((r) => r.score > 0.5);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Initialize portfolio data - stores embeddings in Redis
 * Only embeddings stored (not content) - content stays in code to save storage
 * Auto-detects changes via hash comparison and re-embeds when needed
 */
export async function initializePortfolioData(documents?: Document[]): Promise<void> {
  const docsToStore = documents || portfolioDocuments;
  
  if (docsToStore.length === 0) {
    throw new Error('No portfolio documents to initialize');
  }

  console.log('Initializing portfolio embeddings...');
  console.log('Note: Only embeddings are stored in Redis. Content is kept in code.');
  
  await storeDocuments(docsToStore);
  console.log(`Stored embeddings for ${docsToStore.length} documents`);
  console.log('Embeddings will persist in Redis - auto-updates when portfolio changes.');
}

/**
 * Get storage usage estimate (for monitoring)
 */
export async function getStorageUsage(): Promise<{
  documentCount: number;
  estimatedSizeKB: number;
}> {
  const docIds = await redis.smembers('documents:ids');
  const estimatedSizeKB = docIds.length * 4;
  
  return {
    documentCount: docIds.length,
    estimatedSizeKB,
  };
}
