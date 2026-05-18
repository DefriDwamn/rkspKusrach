# RAG Support Chatbot

## Tech Stack
- Frontend: Next.js (TypeScript)
- Backend: Fastify (TypeScript)
- Shared contracts: Zod + shared TypeScript package
- Tests: Vitest (unit/integration), Playwright (planned for e2e)

## Repository Layout
- `apps/frontend` - web client chat UI
- `apps/backend` - API and RAG orchestration layer
- `packages/shared` - shared typed schemas/contracts
- `docs` - architecture, testing, and roadmap docs

## Quick Start
1. Install dependencies:
   `npm install`
2. Copy env template and adjust values:
  `copy .env.example .env`
3. Download Kaggle assets into `data/raw/kaggle/`.
4. Build the RAG index from Kaggle data:
  `npm run rag:build`
  The default build uses `RAG_INGEST_MAX_DOCUMENTS=3000` so the project stays quick to start; raise that value if you want a larger corpus.
5. (Optional) Start PostgreSQL in Docker for persistent chat sessions:
  `npm run db:up`
6. Run frontend and backend in parallel:
  `npm run dev`

## Database (Docker)
- Start PostgreSQL:
  `npm run db:up`
- Stop containers:
  `npm run db:down`
- Follow DB logs:
  `npm run db:logs`

Backend will use PostgreSQL when `DATABASE_URL` is set.
If `DATABASE_URL` is missing, backend falls back to in-memory session storage.

For the fastest setup, keep generation in Ollama Cloud with `OLLAMA_API_KEY`, `OLLAMA_MODEL` and `OLLAMA_HOST`, and use local embeddings with `OLLAMA_EMBED_HOST=http://localhost:11434`, `OLLAMA_EMBED_MODEL=nomic-embed-text-v2-moe` and `OLLAMA_EMBED_DIMENSIONS=768`.

## Quality Gates
- Type checks:
  `npm run typecheck`
- Tests:
  `npm run test`
- Lint:
  `npm run lint`

## Kaggle Data Requirement
RAG datasets/models must be sourced from Kaggle.
- Place downloaded assets in `data/raw/kaggle/`.
- See `docs/rag-kaggle.md` for the required structure and metadata.
