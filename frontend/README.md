# RAG Portfolio Chatbot

A personal portfolio agent chatbot built with RAG (Retrieval-Augmented Generation), featuring pixel-art message bubbles and a seamless, free tech stack.

## Features

- 🎨 **Pixel-art UI**: Dynamic 9-slice scaled message bubbles with profile pictures
- 🤖 **RAG-powered**: Retrieval-Augmented Generation for accurate portfolio responses
- 💰 **100% Free**: Uses Google Gemini API free tier (no login required for users!)
- ⚡ **Fast**: Google Gemini 1.5 Flash for real-time responses
- 🔍 **Vector Search**: Redis-based vector storage for semantic search
- 🛡️ **Rate Limited**: Built-in rate limiting to prevent spam and API abuse
- 💾 **Storage Optimized**: Only embeddings stored in Redis, portfolio text in code

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **AI/ML**: 
  - Embeddings: Google Gemini Embedding API (`models/embedding-001`)
  - LLM: Google Gemini 1.5 Flash (free tier, no user login required)
  - Orchestration: Vercel AI SDK
- **Database**: Redis (Upstash free tier or local) - stores only embeddings
- **Styling**: Pixel-art assets with 9-slice scaling
