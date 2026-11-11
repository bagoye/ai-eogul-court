// Retrieval layer: query text → the few legal chunks worth showing the model.
// The interface hides where vectors live, so moving to a hosted vector DB (e.g. Upstash Vector)
// only swaps the implementation, like CourtStore does for trial storage.
import { type LegalChunk, loadChunks, loadIndex } from './corpus.js';
import type { Embedder } from './embedder.js';

export interface Hit {
  chunk: LegalChunk;
  score: number;
}
export interface Retrieval {
  // At or above the threshold, best first, at most topK. These go into the prompt.
  hits: Hit[];
  // The best candidates regardless of threshold: ids and scores only, for logs and calibration.
  best: { id: string; score: number }[];
}
export interface Retriever {
  kind: 'vector' | 'keyword';
  retrieve(query: string): Promise<Retrieval>;
}
export interface RetrieveOptions {
  topK: number;
  minScore: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
function rank(scored: Hit[], { topK, minScore }: RetrieveOptions): Retrieval {
  scored.sort((a, b) => b.score - a.score);
  return {
    hits: scored.filter((h) => h.score >= minScore).slice(0, topK),
    best: scored.slice(0, 5).map((h) => ({ id: h.chunk.id, score: round(h.score) })),
  };
}

const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

// Brute-force cosine over pre-normalized vectors. At ~100 chunks × 768 dims this is well under a
// millisecond, so an ANN index would only add a dependency.
export function createVectorRetriever(
  embed: Embedder,
  options: RetrieveOptions,
  // Lazy so a missing or stale index fails the retrieval (logged, verdict continues without
  // sources) instead of the whole server at startup.
  load = () => {
    const chunks = loadChunks();
    return { chunks, vectors: loadIndex(chunks).vectors };
  },
): Retriever {
  let corpus: ReturnType<typeof load> | undefined;
  return {
    kind: 'vector',
    async retrieve(query) {
      corpus ||= load();
      const [q] = await embed([{ text: query }], 'query');
      const scored = corpus.chunks.map((chunk) => ({
        chunk,
        score: dot(q!, corpus!.vectors[chunk.id]!),
      }));
      return rank(scored, options);
    },
  };
}

// Development/test stand-in that needs no API key: character-bigram Dice overlap. Deterministic
// and good enough to exercise the flow and the UI, not a quality baseline.
const bigrams = (s: string) => {
  const t = s.replace(/[^\p{L}\p{N}]/gu, '');
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
};
export function createKeywordRetriever(
  options: RetrieveOptions,
  load: () => LegalChunk[] = loadChunks,
): Retriever {
  let grams: { chunk: LegalChunk; set: Set<string> }[] | undefined;
  return {
    kind: 'keyword',
    async retrieve(query) {
      grams ||= load().map((chunk) => ({
        chunk,
        set: bigrams(`${chunk.label} ${chunk.title} ${chunk.summary}`),
      }));
      const q = bigrams(query);
      const scored = grams.map(({ chunk, set }) => {
        let common = 0;
        for (const g of q) if (set.has(g)) common++;
        return { chunk, score: q.size + set.size ? (2 * common) / (q.size + set.size) : 0 };
      });
      return rank(scored, options);
    },
  };
}
