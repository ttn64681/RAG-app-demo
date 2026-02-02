# RAG Portfolio Chatbot - Complete Architecture Documentation

## Quick Reference

### Critical Implementation Details
- ✅ **Response Method**: `result.toUIMessageStreamResponse()` (NOT `toTextStreamResponse()`)
- ✅ **Runtime**: Edge Runtime (`export const runtime = 'edge'`)
- ✅ **Transport**: `DefaultChatTransport` with `useChat`
- ✅ **Message Format**: Transform `parts` → `content` for `streamText`
- ✅ **Redis**: Upstash REST API (not TCP) for Edge compatibility
- ✅ **Batch Embeddings**: Use `batchEmbedContents` endpoint (1 call for up to 100 docs)
- ✅ **Query Caching**: Cache query embeddings for 24 hours

### Models & Services
- **LLM**: `gemini-2.5-flash` (default, configurable via `GEMINI_MODEL`)
- **Embeddings**: `gemini-embedding-001` (default, configurable via `GEMINI_EMBEDDING_MODEL`)
- **Database**: Upstash Redis (REST API)
- **Framework**: Next.js 16.1.6 (App Router)

### Free Tier Limits
- **Gemini Embeddings**: 15 RPM, 1,500/day
- **Gemini LLM**: 15 RPM, 1,500/day
- **Upstash Redis**: 10,000 commands/day, 256MB storage

### Required Environment Variables
```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_key
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

---

## Overview

This is a **zero-cost** RAG (Retrieval-Augmented Generation) portfolio chatbot built with Next.js, Google Gemini API, and Upstash Redis. The application uses semantic search to retrieve relevant portfolio information and generates contextual responses using an LLM.

**Key Achievement**: Zero gateway costs by bypassing Vercel AI Gateway and using direct API calls with the Vercel AI SDK library (free).

---

## Tech Stack

### Core Technologies
- **Framework**: Next.js 16.1.6 (App Router)
- **Runtime**: Edge Runtime (60s timeout vs 10s Node.js timeout)
- **Language**: TypeScript
- **UI Library**: React 19.2.3

### AI/ML Stack
- **LLM**: Google Gemini (`gemini-2.5-flash` - default, configurable)
- **Embeddings**: Google Gemini (`gemini-embedding-001` - default, configurable)
- **AI SDK**: Vercel AI SDK v6.0.67 (`ai` package)
- **React Hook**: `@ai-sdk/react` v3.0.69 (`useChat`)

### Database
- **Vector Store**: Upstash Redis (REST API - Edge-compatible)
- **Free Tier**: 10,000 commands/day, 256MB storage

### Key Packages
```json
{
  "ai": "^6.0.67",                    // Core AI SDK
  "@ai-sdk/react": "^3.0.69",        // React hooks for AI
  "@ai-sdk/google": "^3.0.20",       // Google provider for AI SDK
  "@upstash/redis": "^1.36.1",       // Redis client (Edge-compatible)
  "@google/generative-ai": "^0.21.0" // Direct Google SDK (used in llm.ts)
}
```

---

## API Keys & Environment Variables

### Required Environment Variables

Create a `.env.local` file with:

```bash
# Google Gemini API Key (REQUIRED)
# Get free key at: https://aistudio.google.com/apikey
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here

# Upstash Redis (REQUIRED for Edge Runtime)
# Get free instance at: https://upstash.com/
# Go to dashboard -> REST API section -> Copy URL and Token
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# Optional: Model Configuration
GEMINI_MODEL=gemini-2.5-flash              # LLM model (default: gemini-2.5-flash)
GEMINI_EMBEDDING_MODEL=gemini-embedding-001 # Embedding model (default: gemini-embedding-001)

# Optional: Production Security
ALLOWED_DOMAIN=your-domain.vercel.app      # For referer validation in production
```

### API Key Setup Steps

1. **Google Gemini API Key**:
   - Visit https://aistudio.google.com/apikey
   - Create a new API key (free tier)
   - Enable "Generative Language API" in Google Cloud Console:
     - Go to https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
     - Click "Enable"
     - Wait a few minutes for activation
   - Free tier limits: 15 RPM, 1,500 requests/day

2. **Upstash Redis**:
   - Visit https://upstash.com/
   - Create a free Redis database
   - Go to dashboard → REST API section
   - Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   - Free tier: 10,000 commands/day, 256MB storage

---

## Architecture Components

### 1. Chat API Route (`/api/chat/route.ts`)

**Purpose**: Main RAG endpoint that handles chat requests, retrieves context, and streams responses.

**Key Features**:
- ✅ Edge Runtime (60s timeout support)
- ✅ Rate limiting (10 requests/minute per IP)
- ✅ Auto-initializes embeddings if missing
- ✅ Auto-updates embeddings when portfolio changes
- ✅ Referer validation in production
- ✅ Message transformation (AI SDK 6.0 `parts` → `content`)

**Critical Implementation Details**:

```typescript
// CRITICAL: Must use toUIMessageStreamResponse() for useChat compatibility
// NOT toTextStreamResponse() - that's for different use cases
const response = result.toUIMessageStreamResponse();
return response;
```

**Why `toUIMessageStreamResponse()`?**
- `useChat` with `DefaultChatTransport` expects UI message stream format
- `toTextStreamResponse()` returns plain text stream (incompatible)
- This was the root cause of messages not appearing in the UI

**Message Flow**:
1. Extract query text from `parts` array (AI SDK 6.0 format)
2. Search for similar documents using RAG
3. Build system message with retrieved context
4. Transform messages from `parts` format to `content` format for `streamText`
5. Stream response using `toUIMessageStreamResponse()`

---

### 2. Embeddings Service (`/lib/embeddings.ts`)

**Purpose**: Generate embeddings using Google Gemini Embedding API.

**Key Features**:
- ✅ Direct API calls (no gateway costs)
- ✅ Batch embedding support (up to 100 documents per request)
- ✅ Query embedding caching (24 hours)
- ✅ Comprehensive error handling for quota/rate limits

**Models Used**:
- **Default**: `gemini-embedding-001` (current recommended model)
- **Deprecated**: `text-embedding-004` (deprecated Jan 14, 2026)
- **Configurable**: Via `GEMINI_EMBEDDING_MODEL` env var

**API Endpoints**:
- Single: `POST /v1beta/models/{model}:embedContent`
- Batch: `POST /v1beta/models/{model}:batchEmbedContents`

**Critical Implementation**:

```typescript
// Batch endpoint requires model in EACH request object
body: JSON.stringify({
  requests: validTexts.map(t => ({
    model: `models/${embeddingModel}`,  // REQUIRED in each request
    content: { parts: [{ text: t.trim() }] }
  }))
})
```

**Cost Optimization**:
- Batch endpoint: 1 API call for up to 100 documents (vs 100 individual calls)
- Query caching: Identical queries reuse cached embeddings (24h TTL)
- Prevents hitting 15 RPM limit during initialization

---

### 3. Vector Store (`/lib/vector-store.ts`)

**Purpose**: Manage document embeddings in Redis and perform semantic search.

**Key Features**:
- ✅ Auto-initialization (embeddings created on first query)
- ✅ Version hashing (auto-re-embedding when portfolio changes)
- ✅ Redis pipelines for batch operations
- ✅ Cosine similarity search
- ✅ Content stored in code (not Redis) - saves storage

**Storage Strategy**:
- **Embeddings**: Stored in Redis (vectors only, ~4KB per document)
- **Content**: Stored in code (`/data/portfolio.ts`) - retrieved on-demand
- **Why**: Saves Redis storage (free tier: 256MB), content changes don't require Redis updates

**Redis Keys Structure**:
```
documents:ids                    # Set of all document IDs
embedding:{docId}               # JSON: {embedding: number[], metadata: {}, docId: string}
portfolio:hash                  # SHA-256 hash of portfolio content
query:embedding:{queryHash}     # Cached query embeddings (24h TTL)
ratelimit:{identifier}         # Rate limit counters (60s TTL)
```

**Critical Functions**:

1. **`searchSimilarDocuments(query, limit)`**:
   - Auto-initializes if embeddings missing
   - Checks portfolio hash for changes (auto-re-embeds)
   - Caches query embeddings (24h)
   - Uses Redis pipeline for batch GET
   - Calculates cosine similarity
   - Returns top N results (similarity > 0.5)

2. **`initializePortfolioData()`**:
   - Generates batch embeddings
   - Stores in Redis using pipeline
   - Stores portfolio hash for change detection

3. **`needsReembedding()`**:
   - Compares current portfolio hash with stored hash
   - Returns `true` if content changed

**Robust Parsing**:
```typescript
// Handles both string (raw) and object (auto-parsed) from Upstash
if (typeof rawData === 'string') {
  parsed = JSON.parse(rawData);
} else {
  parsed = rawData; // Already an object
}
```

---

### 4. Rate Limiting (`/lib/rate-limit.ts`)

**Purpose**: Prevent API abuse and stay within free-tier limits.

**Implementation**:
- Uses Upstash Redis for distributed rate limiting
- 10 requests/minute per IP (leaves buffer below Gemini's 15 RPM)
- Sliding window with TTL-based expiration

**Key Features**:
- ✅ IP-based identification (x-forwarded-for header)
- ✅ Fail-open on Redis errors (doesn't break app)
- ✅ Returns retry-after and reset time

**Redis Commands Used**:
- `GET` - Check current count
- `SET` - Initialize counter with TTL
- `INCR` - Increment counter
- `TTL` - Get remaining time

---

### 5. Redis Client (`/lib/redis.ts`)

**Purpose**: Upstash Redis client configuration (Edge-compatible).

**Critical**: Uses REST API (not TCP) for Edge Runtime compatibility.

```typescript
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

**Why REST API?**
- Edge Runtime doesn't support TCP connections
- Upstash REST API works over HTTP
- Required for `export const runtime = 'edge'`

---

### 6. Chat Interface (`/components/chat-bot/ChatInterface.tsx`)

**Purpose**: React component for chat UI using `useChat` hook.

**Key Features**:
- ✅ AI SDK 6.0 compatible (`DefaultChatTransport`)
- ✅ Manual input state management
- ✅ Status-based loading (not `isLoading`)
- ✅ Message extraction from `parts` array
- ✅ Auto-scroll to latest message

**Critical Implementation**:

```typescript
// MUST use DefaultChatTransport for AI SDK 6.0
const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  // ... callbacks
});

// Extract text from parts (AI SDK 6.0 format)
const parts = message.parts || [];
const textParts = parts
  .filter(isTextUIPart)
  .map(part => part.text);
const messageText = textParts.join('');
```

**Message Format**:
- AI SDK 6.0 uses `parts` array instead of `content` string
- Each part has `type` and `text` properties
- Use `isTextUIPart()` to filter text parts

---

## Cost Optimization Techniques

### 1. Batch Embeddings
- **Before**: 8 documents = 8 API calls (hits 15 RPM limit)
- **After**: 8 documents = 1 API call (stays under limit)
- **Savings**: 87.5% reduction in API calls

### 2. Query Embedding Caching
- **Before**: Same query = new embedding every time
- **After**: Same query = cached embedding (24h TTL)
- **Savings**: Prevents duplicate API calls for identical queries

### 3. Version Hashing
- **Before**: Manual re-embedding after portfolio updates
- **After**: Auto-detects changes and re-embeds only when needed
- **Savings**: No unnecessary re-embedding

### 4. Redis Pipelines
- **Before**: N Redis commands = N network round trips
- **After**: N Redis commands = 1 network round trip
- **Savings**: Reduces Redis command count (stays under 10k/day)

### 5. Content Storage Strategy
- **Before**: Store content in Redis (large strings)
- **After**: Store only embeddings in Redis, content in code
- **Savings**: ~90% reduction in Redis storage usage

### 6. Direct API Calls
- **Before**: Using Vercel AI Gateway (paid service)
- **After**: Direct Google API calls via SDK provider
- **Savings**: $0 gateway costs

---

## Rate Limiting Strategy

### Limits to Monitor

1. **Google Gemini Embeddings**:
   - 15 requests per minute (RPM)
   - 1,500 requests per day
   - **Mitigation**: Batch endpoint + query caching

2. **Google Gemini LLM**:
   - 15 requests per minute (RPM)
   - 1,500 requests per day
   - **Mitigation**: Rate limiting (10 RPM per IP)

3. **Upstash Redis**:
   - 10,000 commands per day
   - **Mitigation**: Pipelines, query caching, content in code

### Rate Limiting Implementation

- **Chat API**: 10 requests/minute per IP (leaves buffer)
- **Embeddings**: Batch endpoint prevents RPM issues
- **Redis**: Pipelines reduce command count

---

## Customization Points

### 1. Portfolio Content

**File**: `/data/portfolio.ts`

```typescript
export const portfolioDocuments: Document[] = [
  {
    id: 'unique-id',
    content: 'Your content here...',
    metadata: { category: 'about', type: 'introduction' },
  },
  // Add more documents...
];
```

**How to Update**:
1. Edit `/data/portfolio.ts`
2. Add/modify/remove documents
3. On next chat request, system auto-detects changes and re-embeds
4. No manual initialization needed

**Best Practices**:
- Keep documents focused (100-500 words each)
- Use descriptive IDs (e.g., `project-1`, `skill-react`)
- Add metadata for filtering (optional)
- Split large content into multiple documents

### 2. Models

**LLM Model** (via `GEMINI_MODEL`):
- `gemini-2.5-flash` (default, recommended)
- `gemini-1.5-flash`
- `gemini-1.5-pro`
- `gemini-pro`

**Embedding Model** (via `GEMINI_EMBEDDING_MODEL`):
- `gemini-embedding-001` (default, recommended)
- ⚠️ `text-embedding-004` (deprecated Jan 14, 2026)

### 3. System Prompt

**File**: `/api/chat/route.ts` (line ~111)

```typescript
const systemMessage = context
  ? `You are a helpful portfolio agent. Use the following context...
     Context: ${context}
     Answer the user's questions...`
  : 'You are a helpful portfolio agent...';
```

**Customize**: Modify the prompt template to change bot personality/behavior.

### 4. Similarity Threshold

**File**: `/lib/vector-store.ts` (line ~225)

```typescript
.filter((r) => r.score > 0.5); // Adjust threshold here
```

**Customize**: Lower (0.3) = more results, Higher (0.7) = stricter matching.

### 5. Context Window Size

**File**: `/api/chat/route.ts` (line ~103)

```typescript
const similarDocs = await searchSimilarDocuments(queryText.trim(), 3);
//                                                                    ^ Change this
```

**Customize**: More documents = more context but higher token usage.

### 6. Message History Limit

**File**: `/api/chat/route.ts` (line ~121)

```typescript
const recentMessages = messages.slice(-6); // Keep last 6 messages
//                                    ^ Change this
```

**Customize**: More messages = better context but higher token usage.

---

## Critical Implementation Details

### 1. Edge Runtime Requirement

**File**: `/api/chat/route.ts`

```typescript
export const runtime = 'edge';
```

**Why**: 
- Node.js runtime: 10s timeout (too short for streaming)
- Edge runtime: 60s timeout (sufficient for streaming)
- Required for Upstash REST API (no TCP support)

### 2. Response Format for useChat

**CRITICAL**: Must use `toUIMessageStreamResponse()` not `toTextStreamResponse()`

```typescript
// ✅ CORRECT
const response = result.toUIMessageStreamResponse();

// ❌ WRONG (won't work with useChat)
const response = result.toTextStreamResponse();
```

### 3. Message Format Transformation

**AI SDK 6.0 Breaking Change**: Messages use `parts` array, not `content` string.

**Server-side** (route.ts):
```typescript
// Transform from parts → content for streamText
const transformedMessages = recentMessages.map(msg => {
  let content = '';
  if (msg.parts && Array.isArray(msg.parts)) {
    content = msg.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('');
  }
  return { role: msg.role, content };
});
```

**Client-side** (ChatInterface.tsx):
```typescript
// Extract text from parts for display
const parts = message.parts || [];
const textParts = parts
  .filter(isTextUIPart)
  .map(part => part.text);
const messageText = textParts.join('');
```

### 4. DefaultChatTransport Requirement

**CRITICAL**: `useChat` requires `DefaultChatTransport` in AI SDK 6.0

```typescript
// ✅ CORRECT
const { messages } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});

// ❌ WRONG (api option doesn't exist)
const { messages } = useChat({
  api: '/api/chat', // TypeScript error
});
```

### 5. Upstash Method Names

**CRITICAL**: Upstash uses lowercase method names (different from standard Redis)

```typescript
// ✅ CORRECT (Upstash)
await redis.smembers('documents:ids');
await redis.sadd('documents:ids', docId);

// ❌ WRONG (standard Redis - won't work)
await redis.sMembers('documents:ids');
await redis.sAdd('documents:ids', docId);
```

---

## Redundant/Non-Optimized Code

### 1. Debug Logging (Remove in Production)

**Files**: 
- `/api/chat/route.ts` (lines 154-157, 175-176, 193-194)
- `/components/chat-bot/ChatInterface.tsx` (lines 31-33, 39-41, 46-55, 76-78)

**Action**: Remove all `#region agent log` blocks and debug console.logs before production.

### 2. Unused Import

**File**: `/api/chat/route.ts`

```typescript
import { RateLimitError } from '@/lib/embeddings';
```

**Note**: `RateLimitError` is defined in `embeddings.ts` but could be moved to `rate-limit.ts` for better organization.

### 3. Redundant Error Handling

**File**: `/lib/vector-store.ts` (lines 138-162)

The catch block in `searchSimilarDocuments` has extensive error checking that might be redundant since `generateEmbedding` already handles these errors. However, this prevents duplicate API calls, so it's actually **optimized**, not redundant.

### 4. Portfolio Hash Function

**File**: `/lib/embeddings.ts` (lines 283-289)

The `generatePortfolioHash` function is defined in `embeddings.ts` but is only used by `vector-store.ts`. Consider moving it to `vector-store.ts` for better organization, but current location is fine.

---

## How to Update Portfolio

### Method 1: Edit Portfolio File (Recommended)

1. Open `/data/portfolio.ts`
2. Modify the `portfolioDocuments` array:
   - Add new documents
   - Edit existing content
   - Remove documents
3. Save the file
4. On next chat request, system automatically:
   - Detects hash change
   - Re-embeds all documents
   - Updates Redis storage

**No manual steps required** - fully automated!

### Method 2: Programmatic Update

```typescript
import { initializePortfolioData } from '@/lib/vector-store';
import { Document } from '@/lib/vector-store';

const newDocuments: Document[] = [
  { id: 'new-1', content: 'New content...', metadata: {} },
  // ...
];

await initializePortfolioData(newDocuments);
```

---

## Free Tier Limits & Monitoring

### Google Gemini Limits

| Resource | Free Tier Limit | Monitoring |
|----------|----------------|------------|
| Embeddings | 15 RPM, 1,500/day | Check Google Cloud Console |
| LLM | 15 RPM, 1,500/day | Check Google Cloud Console |
| Tokens | 32,000/min | Check API responses |

### Upstash Redis Limits

| Resource | Free Tier Limit | Monitoring |
|----------|----------------|------------|
| Commands | 10,000/day | Check Upstash Dashboard |
| Storage | 256MB | Check Upstash Dashboard |

### Vercel Limits

| Resource | Free Tier Limit | Notes |
|----------|----------------|-------|
| Bandwidth | 100GB/month | Monitor in Vercel Dashboard |
| Function Duration | 60s (Edge) | Already using Edge Runtime |

---

## Security Considerations

### 1. API Key Protection

- ✅ API keys stored in `.env.local` (never committed)
- ✅ Server-side only (never exposed to client)
- ✅ Vercel environment variables for production

### 2. Referer Validation

**File**: `/api/chat/route.ts` (lines 88-98)

```typescript
if (process.env.NODE_ENV === 'production') {
  const referer = req.headers.get('referer');
  const allowedDomain = process.env.ALLOWED_DOMAIN || 'your-domain.vercel.app';
  
  if (!referer || !referer.includes(allowedDomain)) {
    return new Response('Unauthorized', { status: 401 });
  }
}
```

**Purpose**: Prevents quota theft from unauthorized domains.

**Setup**: Set `ALLOWED_DOMAIN` env var in production.

### 3. Rate Limiting

- Prevents abuse and quota exhaustion
- IP-based (can be enhanced with authentication)

---

## Deployment Checklist

1. ✅ Set all environment variables in Vercel
2. ✅ Enable Generative Language API in Google Cloud
3. ✅ Create Upstash Redis instance
4. ✅ Set `ALLOWED_DOMAIN` for production
5. ✅ Remove debug logging
6. ✅ Test chat functionality
7. ✅ Monitor API usage in Google Cloud Console
8. ✅ Monitor Redis usage in Upstash Dashboard

---

## Troubleshooting

### Issue: "Free tier quota not enabled"

**Solution**: Enable Generative Language API in Google Cloud Console:
1. Go to https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
2. Click "Enable"
3. Wait a few minutes

### Issue: Messages not appearing in UI

**Solution**: Ensure using `toUIMessageStreamResponse()` not `toTextStreamResponse()`

### Issue: "limit: 0" errors

**Solution**: Free tier not enabled (see above)

### Issue: Rate limit errors (429)

**Solution**: 
- Check if batch embeddings are being used
- Verify query caching is working
- Reduce request frequency

### Issue: Redis connection errors

**Solution**: 
- Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set
- Ensure using REST API (not TCP connection string)
- Check Upstash dashboard for instance status

---

## Key Takeaways for Future RAG Apps

1. **Always use `toUIMessageStreamResponse()`** for `useChat` compatibility
2. **Use Edge Runtime** for longer timeouts (60s vs 10s)
3. **Batch embeddings** to stay under RPM limits
4. **Cache query embeddings** to reduce API calls
5. **Store content in code**, embeddings in Redis (saves storage)
6. **Use Redis pipelines** to reduce command count
7. **Version hash** for auto-re-embedding
8. **Transform messages** from `parts` to `content` format
9. **Use `DefaultChatTransport`** with `useChat` in AI SDK 6.0
10. **Direct API calls** bypass gateway costs

---

## File Structure

```
frontend/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── chat/
│   │           └── route.ts          # Main RAG endpoint
│   ├── components/
│   │   └── chat-bot/
│   │       ├── ChatInterface.tsx     # Chat UI component
│   │       ├── PixelBubble.tsx       # Message bubble component
│   │       └── LoadingEllipsis.tsx    # Loading animation
│   ├── lib/
│   │   ├── embeddings.ts              # Embedding generation
│   │   ├── vector-store.ts            # Vector search & storage
│   │   ├── rate-limit.ts             # Rate limiting
│   │   ├── redis.ts                  # Redis client
│   └── data/
│       └── portfolio.ts              # Portfolio content
├── .env.local                        # Environment variables (gitignored)
└── package.json                      # Dependencies
```

---

## Summary

This RAG app achieves **zero gateway costs** by:
1. Using Vercel AI SDK library (free) instead of AI Gateway (paid)
2. Direct Google API calls via `@ai-sdk/google` provider
3. Batch embeddings to minimize API calls
4. Query caching to prevent duplicate calls
5. Efficient Redis usage with pipelines
6. Content stored in code (not Redis)

**Critical Success Factor**: Using `toUIMessageStreamResponse()` instead of `toTextStreamResponse()` for `useChat` compatibility.

**Architecture**: Edge Runtime → Direct API Calls → Upstash Redis → Auto-re-embedding → Zero manual steps.
