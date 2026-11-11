import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
import { findLegalRefs, isCovered } from '../../shared/legal-refs.js';
import type { Trial } from '../../shared/types.js';
import {
  createGeminiProvider,
  mockProvider,
  SYSTEM_PROMPT,
  validateOutput,
  type AIContext,
} from './ai.js';
import { advance, createTrial, type Action } from './engine.js';
import { hashChunks, loadChunks, loadIndex, type LegalChunk } from './rag/corpus.js';
import { createKeywordRetriever, createVectorRetriever, type Retriever } from './rag/retriever.js';
import { RAG_RULES, retrievalQuery, uncitedRefs } from './rag/prompt.js';

const chunks = loadChunks();
const chunk = (id: string) => chunks.find((c) => c.id === id)!;
const keyword = createKeywordRetriever({ topK: 3, minScore: 0.08 });

const NOISE_STORY =
  '윗집에서 밤마다 쿵쿵 뛰는 소리가 나서 잠을 못 자요. 층간소음 때문에 찾아갔는데 사과도 없었어요.';
async function closingTrial(summary = NOISE_STORY) {
  let trial = await createTrial(
    { requestId: randomUUID(), mode: 'plaintiff', title: '', summary, photos: [] },
    mockProvider,
    'mock',
  );
  trial = await advance(trial, act(trial, { type: 'end' }), mockProvider);
  return trial;
}
const act = (trial: Trial, fields: Partial<Action> = {}): Action => ({
  type: 'answer',
  version: trial.version,
  input: '',
  requestId: randomUUID(),
  photos: [],
  ...fields,
});
const verdictContext = async (legalSources: LegalChunk[]): Promise<AIContext> => ({
  trial: await closingTrial(),
  operation: 'verdict',
  input: '',
  legalSources,
});
async function verdictOutput(
  context: AIContext,
  reasons: string[],
  citations: { id: string; why: string }[],
) {
  const out = await mockProvider(context);
  out.verdict = { ...out.verdict!, reasons, citations };
  return out;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('legal reference extraction', () => {
  it('finds articles and case numbers, carrying a named law forward', () => {
    const refs = findLegalRefs(
      '민법 제618조와 제623조, 「주택임대차보호법」 제3조의2, 대법원 99다34697 판결',
    );
    expect(refs).toEqual([
      { kind: 'article', law: '민법', id: '618' },
      { kind: 'article', law: '민법', id: '623' },
      { kind: 'article', law: '주택임대차보호법', id: '3의2' },
      { kind: 'case', law: '', id: '99다34697' },
    ]);
  });
  it('does not mistake dates, floors or amounts for case numbers', () => {
    expect(findLegalRefs('2024년 10월 3일, 3층 10호에 사는 이웃에게 10만 원을 빌려줬다')).toEqual(
      [],
    );
  });
  it('reads a bare article inside a statute as that statute, even after another law', () => {
    const refs = findLegalRefs(
      '「민사집행법」 제41조에도 불구하고 제3조제1항의 대항요건',
      '주택임대차보호법',
    );
    expect(refs).toContainEqual({ kind: 'article', law: '주택임대차보호법', id: '3' });
  });
  it('matches shortened law names and unnamed articles', () => {
    const allowed = findLegalRefs('「공동주택 층간소음의 범위와 기준에 관한 규칙」 제2조');
    expect(isCovered({ kind: 'article', law: '규칙', id: '2' }, allowed)).toBe(true);
    expect(isCovered({ kind: 'article', law: '', id: '2' }, allowed)).toBe(true);
    expect(isCovered({ kind: 'article', law: '민법', id: '2' }, allowed)).toBe(false);
  });
});

describe('corpus', () => {
  it('stays within the planned size, with unique ids, official links and its own citation', () => {
    expect(chunks.length).toBeGreaterThanOrEqual(50);
    expect(chunks.length).toBeLessThanOrEqual(200);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    for (const c of chunks) {
      expect(c.url).toMatch(/^https:\/\/www\.law\.go\.kr\//);
      expect(c.text.startsWith(c.label)).toBe(true);
      // A source always covers the label it is shown under, so citing it allows naming it.
      for (const ref of findLegalRefs(c.label)) expect(isCovered(ref, c.refs)).toBe(true);
    }
  });
  it('rejects an index built from different chunks', () => {
    const stale = { model: 'm', dimensions: 1, chunksHash: 'old', vectors: {} };
    expect(() => loadIndex(chunks, writeTemp(stale))).toThrow(/stale/);
    const fresh = { ...stale, chunksHash: hashChunks(chunks) };
    expect(() => loadIndex(chunks, writeTemp(fresh))).toThrow(/lacks vectors/);
  });
});

describe('retrievers', () => {
  it('ranks by cosine similarity and applies top-k and the threshold', async () => {
    const corpus = chunks.slice(0, 3);
    const vectors = {
      [corpus[0]!.id]: [1, 0],
      [corpus[1]!.id]: [0.8, 0.6],
      [corpus[2]!.id]: [0, 1],
    };
    const embed = vi.fn(async () => [[1, 0]]);
    const retriever = createVectorRetriever(embed, { topK: 3, minScore: 0.5 }, () => ({
      chunks: corpus,
      vectors,
    }));
    const { hits, best } = await retriever.retrieve('질의');
    expect(hits.map((h) => h.chunk.id)).toEqual([corpus[0]!.id, corpus[1]!.id]);
    expect(best.map((b) => b.score)).toEqual([1, 0.8, 0]);
    expect(embed).toHaveBeenCalledWith([{ text: '질의' }], 'query');
  });
  it('keyword stand-in finds noise rules for a noise story', async () => {
    const { hits } = await keyword.retrieve('층간소음 공동주택 소음');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.chunk.topic).toBe('층간소음');
  });
});

describe('prompt and citation rules', () => {
  it('puts the citation rules in the system prompt and the rewritten query first in the search', async () => {
    expect(SYSTEM_PROMPT).toContain(RAG_RULES);
    const trial = await closingTrial();
    expect(trial.legalQuery).toBeTruthy();
    expect(retrievalQuery(trial).startsWith(trial.legalQuery!)).toBe(true);
  });
  it('flags an article that no cited source contains', () => {
    const cited = [chunk('law-민법-750')];
    expect(uncitedRefs(['민법 제750조에 따라 배상 책임을 생각해 볼 수 있습니다.'], cited)).toEqual(
      [],
    );
    expect(uncitedRefs(['민법 제758조에 따르면'], cited)).toEqual([
      { kind: 'article', law: '민법', id: '758' },
    ]);
  });
  it('rejects unknown source ids and laws outside the cited sources', async () => {
    const sources = [chunk('law-민법-750'), chunk('law-민법-217')];
    const ctx = await verdictContext(sources);
    const unknown = await verdictOutput(ctx, ['이유'], [{ id: 'law-민법-9999', why: '없는 근거' }]);
    expect(() => validateOutput(unknown, ctx)).toThrow('Unknown legal source');
    const invented = await verdictOutput(
      ctx,
      ['민법 제390조 위반입니다.'],
      [{ id: 'law-민법-750', why: '참고' }],
    );
    expect(() => validateOutput(invented, ctx)).toThrow('Uncited legal reference');
    // Real article, retrieved, but not cited: still must be cited before it is named.
    const uncited = await verdictOutput(
      ctx,
      ['민법 제217조를 참고하면 소음은 참아야 할 한도가 있습니다.'],
      [],
    );
    expect(() => validateOutput(uncited, ctx)).toThrow('Uncited legal reference');
    const ok = await verdictOutput(
      ctx,
      ['민법 제217조를 참고하면 소음은 참아야 할 한도가 있습니다.'],
      [{ id: 'law-민법-217', why: '이웃 간 생활방해의 한도' }],
    );
    expect(validateOutput(ok, ctx).verdict?.citations).toHaveLength(1);
  });
  it('lenient mode drops only the reason with an uncited law', async () => {
    const ctx = await verdictContext([]);
    const out = await verdictOutput(
      ctx,
      ['진술에 따르면 소음이 반복되었습니다.', '민법 제750조 위반입니다.'],
      [],
    );
    expect(() => validateOutput(structuredClone(out), ctx)).toThrow('Uncited legal reference');
    expect(validateOutput(out, ctx, { lenient: true }).verdict?.reasons).toEqual([
      '진술에 따르면 소음이 반복되었습니다.',
    ]);
  });
  it('limits the Gemini schema to retrieved ids and sends source text, not links', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key-never-real');
    const sources = [chunk('law-민법-217'), chunk('prec-2020마7677-1')];
    const ctx = await verdictContext(sources);
    const out = await verdictOutput(
      ctx,
      ['진술에 따르면 소음이 반복되었습니다.'],
      [{ id: 'law-민법-217', why: '생활방해의 한도' }],
    );
    generateContent.mockResolvedValue({ text: JSON.stringify(out) });
    await createGeminiProvider()(ctx);
    const call = generateContent.mock.calls[0]![0];
    const schema = call.config.responseJsonSchema.properties.verdict.anyOf[0];
    expect(schema.properties.citations.items.properties.id.enum).toEqual(sources.map((s) => s.id));
    const payload = JSON.parse(call.contents[0].parts[0].text);
    expect(payload.legalSources.map((s: { id: string }) => s.id)).toEqual(sources.map((s) => s.id));
    expect(payload.legalSources[0]).not.toHaveProperty('url');
    expect(payload.trial).not.toHaveProperty('retrieval');
    // No sources: the model cannot cite anything at all.
    generateContent.mockResolvedValue({
      text: JSON.stringify(await verdictOutput(ctx, ['이유'], [])),
    });
    await createGeminiProvider()({ ...ctx, legalSources: [] });
    const empty =
      generateContent.mock.calls[1]![0].config.responseJsonSchema.properties.verdict.anyOf[0];
    expect(empty.properties).not.toHaveProperty('citations');
  });
  it('asks for the search query only in the opening turn', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key-never-real');
    const ctx = await verdictContext([]);
    generateContent.mockResolvedValue({
      text: JSON.stringify(await verdictOutput(ctx, ['이유'], [])),
    });
    await createGeminiProvider()(ctx);
    expect(
      generateContent.mock.calls[0]![0].config.responseJsonSchema.properties,
    ).not.toHaveProperty('legalQuery');
    const opening = { trial: ctx.trial, operation: 'opening' as const, input: NOISE_STORY };
    generateContent.mockResolvedValue({ text: JSON.stringify(await mockProvider(opening)) });
    await createGeminiProvider()(opening).catch(() => undefined);
    expect(generateContent.mock.calls[1]![0].config.responseJsonSchema.required).toContain(
      'legalQuery',
    );
  });
});

describe('verdict with retrieval', () => {
  it('attaches cited sources with their links', async () => {
    const trial = await closingTrial();
    const done = await advance(trial, act(trial, { type: 'verdict' }), mockProvider, keyword);
    expect(done.verdict?.legalBasis).toBe('cited');
    const [source] = done.verdict!.sources!;
    expect(source!.url).toMatch(/^https:\/\/www\.law\.go\.kr\//);
    expect(source!.why).toBeTruthy();
    expect(done.retrieval?.hits[0]?.id).toBe(source!.id);
  });
  it('says "none" when nothing passes the threshold, "off" without RAG', async () => {
    const strict = createKeywordRetriever({ topK: 3, minScore: 0.99 });
    let trial = await closingTrial();
    const none = await advance(trial, act(trial, { type: 'verdict' }), mockProvider, strict);
    expect(none.verdict).toMatchObject({ legalBasis: 'none', sources: [] });
    trial = await closingTrial();
    const off = await advance(trial, act(trial, { type: 'verdict' }), mockProvider);
    expect(off.verdict).toMatchObject({ legalBasis: 'off', sources: [] });
    expect(off.retrieval).toBeUndefined();
  });
  it('still delivers the verdict when the search itself fails', async () => {
    const broken: Retriever = {
      kind: 'vector',
      retrieve: async () => {
        throw new Error('index.json not found');
      },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const trial = await closingTrial();
    const done = await advance(trial, act(trial, { type: 'verdict' }), mockProvider, broken);
    expect(done.phase).toBe('completed');
    expect(done.verdict).toMatchObject({ legalBasis: 'error', sources: [] });
  });
});

function writeTemp(value: unknown) {
  const path = join(mkdtempSync(join(tmpdir(), 'rag-')), 'index.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}
