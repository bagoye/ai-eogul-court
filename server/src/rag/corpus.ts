// The legal corpus built by scripts/rag (chunks.json) and its embedding index (index.json).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LegalRef } from '../../../shared/legal-refs.js';

export interface LegalChunk {
  id: string;
  type: 'statute' | 'precedent';
  topic: string;
  label: string;
  title: string;
  text: string;
  summary: string;
  url: string;
  refs: LegalRef[];
}
export interface EmbeddingIndex {
  model: string;
  dimensions: number;
  // sha256 of the chunks array the vectors were computed from; a mismatch means a stale index.
  chunksHash: string;
  vectors: Record<string, number[]>;
}

// The compiled server runs from server/dist/server/src/rag, tsx from server/src/rag, and the
// Vercel function from /var/task; walk up instead of hard-coding the depth.
export function findDataFile(name: string, start = dirname(fileURLToPath(import.meta.url))) {
  for (let dir = start; ; dir = dirname(dir)) {
    const candidate = join(dir, 'data', 'rag', name);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) throw new Error(`data/rag/${name} not found. Run npm run rag:build.`);
  }
}

export const hashChunks = (chunks: LegalChunk[]) =>
  createHash('sha256').update(JSON.stringify(chunks)).digest('hex');

export function loadChunks(path = findDataFile('chunks.json')): LegalChunk[] {
  const { chunks } = JSON.parse(readFileSync(path, 'utf8')) as { chunks: LegalChunk[] };
  if (!Array.isArray(chunks) || !chunks.length) throw new Error('chunks.json has no chunks');
  return chunks;
}

export function loadIndex(chunks: LegalChunk[], path = findDataFile('index.json')): EmbeddingIndex {
  const index = JSON.parse(readFileSync(path, 'utf8')) as EmbeddingIndex;
  if (index.chunksHash !== hashChunks(chunks))
    throw new Error('index.json is stale for chunks.json. Run npm run rag:embed.');
  const missing = chunks.filter((c) => index.vectors[c.id]?.length !== index.dimensions);
  if (missing.length) throw new Error(`index.json lacks vectors for ${missing[0]!.id}`);
  return index;
}
