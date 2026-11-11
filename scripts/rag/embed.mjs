// Step 3/3: embeds every chunk → data/rag/index.json (model, dimensions, chunk hash, vectors).
// Uses the server's own embedder (built to server/dist), so documents and runtime queries share
// one formatter and one model. Unchanged chunks reuse their vectors from the previous index,
// so re-running after editing sources.json (or after an interrupted run) only pays for the rest.
// Usage: npm run rag:embed   (needs GEMINI_API_KEY in .env; npm run rag:build runs all steps)
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  createGeminiEmbedder,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from '../../server/dist/server/src/rag/embedder.js';
import { hashChunks, loadChunks } from '../../server/dist/server/src/rag/corpus.js';
import { CHUNKS, INDEX, readJSON, writeJSON } from './lib.mjs';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY가 필요합니다. 루트 .env에 넣고 다시 실행하세요.');
  process.exit(1);
}
const model = process.env.GEMINI_EMBEDDING_MODEL || EMBEDDING_MODEL;
// The free tier allows 30,000 embedding tokens a minute. Korean runs close to one token per
// character, so characters are a conservative token estimate; stay under the budget per window.
const TOKENS_PER_MINUTE = Number(process.env.RAG_EMBED_TPM ?? 24000);

const chunks = loadChunks(CHUNKS);
// What is embedded: the citation label as title, the full chunk text as body.
const inputOf = (c) => ({ title: c.label, text: c.text });
const cost = (c) => c.label.length + c.text.length + 40;
const fingerprint = (c) =>
  createHash('sha256')
    .update(JSON.stringify([model, EMBEDDING_DIMENSIONS, inputOf(c)]))
    .digest('hex');

const previous = existsSync(INDEX) ? readJSON(INDEX) : undefined;
const reusable = previous?.model === model && previous?.dimensions === EMBEDDING_DIMENSIONS;
const vectors = {};
const fingerprints = {};
const todo = [];
for (const c of chunks) {
  fingerprints[c.id] = fingerprint(c);
  if (reusable && previous.fingerprints?.[c.id] === fingerprints[c.id] && previous.vectors[c.id])
    vectors[c.id] = previous.vectors[c.id];
  else todo.push(c);
}

// Written after every few chunks: an interrupted run keeps its progress (the index stays
// unusable to the server until every chunk has a vector, which loadIndex checks).
const save = () =>
  writeJSON(INDEX, {
    $comment: '생성 파일: npm run rag:embed. data/rag/chunks.json과 함께 커밋합니다.',
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    chunksHash: hashChunks(chunks),
    fingerprints: Object.fromEntries(Object.keys(vectors).map((id) => [id, fingerprints[id]])),
    vectors,
  });

const embed = createGeminiEmbedder({
  apiKey,
  model,
  dimensions: EMBEDDING_DIMENSIONS,
  timeoutMs: 30000,
});
const window = [];
let sent = 0;
for (const [i, c] of todo.entries()) {
  // Rolling one-minute window of estimated tokens.
  for (;;) {
    while (window.length && Date.now() - window[0].at > 60000) window.shift();
    const used = window.reduce((n, w) => n + w.tokens, 0);
    if (used + cost(c) <= TOKENS_PER_MINUTE) break;
    await sleep(60000 - (Date.now() - window[0].at) + 200);
  }
  window.push({ at: Date.now(), tokens: cost(c) });
  const [vector] = await embed([inputOf(c)], 'document');
  // 5 decimals keep the index small; cosine ranking does not change at this precision.
  vectors[c.id] = vector.map((v) => Math.round(v * 1e5) / 1e5);
  sent += cost(c);
  if ((i + 1) % 10 === 0 || i + 1 === todo.length) {
    save();
    console.log(`embedded ${i + 1}/${todo.length}`);
  }
}
save();
console.log(
  `embed: ${todo.length} new, ${chunks.length - todo.length} reused (${model}, ${EMBEDDING_DIMENSIONS} dims). ~${sent} tokens (estimated).`,
);
