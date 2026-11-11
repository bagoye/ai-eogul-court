import { AppError } from '../errors.js';
import { loadChunks, loadIndex } from './corpus.js';
import { createGeminiEmbedder, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './embedder.js';
import { createKeywordRetriever, createVectorRetriever, type Retriever } from './retriever.js';

export type { Retriever, Retrieval, Hit } from './retriever.js';
export type { LegalChunk } from './corpus.js';

// RAG_MODE=off runs the pre-RAG prompt path (used for the before/after evaluation).
// Mock AI pairs with the keyword retriever so the flow and UI work without an API key.
export function retrieverFromEnv(mode: 'gemini' | 'mock'): Retriever | undefined {
  const ragMode = (process.env.RAG_MODE || 'on').toLowerCase();
  if (!['on', 'off'].includes(ragMode)) throw new Error('RAG_MODE must be on or off');
  if (ragMode === 'off') return undefined;
  const topK = Number(process.env.RAG_TOP_K || 3);
  if (!Number.isInteger(topK) || topK < 1 || topK > 5) throw new Error('RAG_TOP_K must be 1-5');
  if (mode === 'mock') return createKeywordRetriever({ topK, minScore: 0.08 });
  const minScore = Number(process.env.RAG_MIN_SCORE || 0.65);
  if (!(minScore >= 0 && minScore < 1)) throw new Error('RAG_MIN_SCORE must be between 0 and 1');
  // Only the index's model can embed queries into the same space; keep these in step with
  // scripts/rag/embed.mjs (the index records both and loadIndex is checked against them).
  const model = process.env.GEMINI_EMBEDDING_MODEL || EMBEDDING_MODEL;
  return createVectorRetriever(
    async (inputs, kind) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new AppError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY가 필요합니다.');
      return createGeminiEmbedder({ apiKey, model, dimensions: EMBEDDING_DIMENSIONS })(
        inputs,
        kind,
      );
    },
    { topK, minScore },
    () => {
      const chunks = loadChunks();
      const index = loadIndex(chunks);
      if (index.model !== model || index.dimensions !== EMBEDDING_DIMENSIONS)
        throw new Error(
          `index.json was built with ${index.model}/${index.dimensions}, not ${model}`,
        );
      return { chunks, vectors: index.vectors };
    },
  );
}
