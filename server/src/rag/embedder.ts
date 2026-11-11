// Text → vector. Documents (scripts/rag/embed.mjs) and queries (runtime) go through the same
// formatter, so both sides of the asymmetric retrieval task always match.
import { GoogleGenAI } from '@google/genai';

export type EmbedKind = 'query' | 'document';
export interface EmbedInput {
  text: string;
  title?: string;
}
export type Embedder = (inputs: EmbedInput[], kind: EmbedKind) => Promise<number[][]>;

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMENSIONS = 768;

// gemini-embedding-2 takes the retrieval task as a text prefix; the 001 model used taskType.
const usesPrefix = (model: string) => !/embedding-001$/u.test(model);
export function formatForEmbedding({ text, title }: EmbedInput, kind: EmbedKind, model: string) {
  if (!usesPrefix(model)) return text;
  return kind === 'query'
    ? `task: search result | query: ${text}`
    : `title: ${title || 'none'} | text: ${text}`;
}

// Truncated (768 of 3072) dimensions are not unit length; normalize so cosine = dot product.
export function normalize(vector: number[]) {
  const norm = Math.hypot(...vector);
  return norm ? vector.map((v) => v / norm) : vector;
}

export function createGeminiEmbedder({
  apiKey,
  model = EMBEDDING_MODEL,
  dimensions = EMBEDDING_DIMENSIONS,
  timeoutMs = 8000,
}: {
  apiKey: string;
  model?: string;
  dimensions?: number;
  timeoutMs?: number;
}): Embedder {
  const ai = new GoogleGenAI({ apiKey });
  // One input per request, in order: gemini-embedding-2 folds a multi-input request into a single
  // embedding, and parallel calls burn the free tier's per-minute token quota at once.
  return async (inputs, kind) => {
    const vectors: number[][] = [];
    for (const input of inputs) {
      const response = await ai.models.embedContent({
        model,
        contents: formatForEmbedding(input, kind, model),
        config: {
          outputDimensionality: dimensions,
          ...(usesPrefix(model)
            ? {}
            : { taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' }),
          httpOptions: { timeout: timeoutMs },
        },
      });
      const values = response.embeddings?.[0]?.values;
      if (response.embeddings?.length !== 1 || values?.length !== dimensions)
        throw new Error('Unexpected embedding response');
      vectors.push(normalize(values));
    }
    return vectors;
  };
}
