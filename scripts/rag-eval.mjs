// RAG before/after evaluation (docs/rag-eval.md).
// For each test story: one opening turn with the current code, then the SAME closing trial gets
// three verdicts — A: the pre-RAG server (commit edfbdbf, built into .cache/before);
// B: the current server with retrieval; C: a stress test, the pre-RAG prompt plus an instruction
// to cite statutes and case numbers from memory (what "legal grounds without RAG" looks like).
// The order rotates per story.
// Measured per verdict: model calls, tokens (from usageMetadata, via a fetch wrapper so both
// builds are counted the same way), latency, cited sources, and every statute article / case
// number in the verdict text, checked against the real statute files (legalize-kr, pinned).
// Usage: npm run eval:rag   (needs GEMINI_API_KEY in .env, and the baseline build:
//   git worktree add .cache/before edfbdbf && npx tsc -p .cache/before/server/tsconfig.json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { findLegalRefs, formatRef } from '../shared/legal-refs.ts';
import { ROOT, SOURCES, readJSON, rawUrl } from './rag/lib.mjs';

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY가 필요합니다. 루트 .env에 넣고 다시 실행하세요.');
  process.exit(1);
}
const BEFORE = join(ROOT, '.cache/before/server/dist/server/src');
if (!existsSync(join(BEFORE, 'engine.js'))) {
  console.error('기준선 빌드가 없습니다. 파일 첫 주석의 명령으로 .cache/before를 만드세요.');
  process.exit(1);
}
const now = await import('../server/dist/server/src/engine.js');
const nowAI = await import('../server/dist/server/src/ai.js');
const { retrieverFromEnv } = await import('../server/dist/server/src/rag/index.js');
const before = await import(`file:///${join(BEFORE, 'engine.js').replace(/\\/g, '/')}`);
const beforeAI = await import(`file:///${join(BEFORE, 'ai.js').replace(/\\/g, '/')}`);

// Paid-tier list prices per 1M tokens (checked 2026-11-11, third-party listings of
// ai.google.dev/pricing). Output includes thinking tokens. The free tier is $0; these show what
// the same traffic would cost on the paid tier.
const PRICE = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  embedding: 0.2,
};
const GAP = Number(process.env.EVAL_GAP_MS ?? 4500);
const ONLY = process.env.EVAL_ONLY?.split(',');

// --- token accounting: every generateContent / embedContent response, tagged by condition ---
let tag = 'setup';
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const response = await realFetch(input, init);
  const kind = /:generateContent/.test(url) ? 'generate' : /:embedContent/.test(url) ? 'embed' : '';
  if (kind) {
    const body = await response
      .clone()
      .json()
      .catch(() => ({}));
    const u = body.usageMetadata || {};
    calls.push({
      tag,
      kind,
      model: url.match(/models\/([^:]+):/)?.[1],
      status: response.status,
      prompt: u.promptTokenCount || 0,
      output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    });
  }
  return response;
};

// --- statute existence check against the real files ---
const sources = readJSON(SOURCES);
const lawCache = new Map();
async function lawArticles(law) {
  if (lawCache.has(law)) return lawCache.get(law);
  const path = join(ROOT, '.cache/rag/legalize-kr/kr', law, '법률.md');
  let text;
  if (existsSync(path)) text = readFileSync(path, 'utf8');
  else {
    const r = await realFetch(rawUrl(sources.repos.laws, `kr/${law}/법률.md`));
    if (r.ok) {
      text = await r.text();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  }
  const set = text
    ? new Set(
        [...text.matchAll(/^##### 제(\d+)조(?:의(\d+))?/gmu)].map((m) =>
          m[2] ? `${m[1]}의${m[2]}` : m[1],
        ),
      )
    : null;
  lawCache.set(law, set);
  return set;
}
const corpusCases = new Set(
  readJSON(join(ROOT, 'data/rag/chunks.json'))
    .chunks.flatMap((c) => c.refs)
    .filter((r) => r.kind === 'case')
    .map((r) => r.id),
);
async function classify(ref) {
  if (ref.kind === 'case') return corpusCases.has(ref.id) ? 'real' : 'case-unverified';
  if (!ref.law) return 'no-law-name';
  const articles = await lawArticles(ref.law);
  if (!articles) return 'law-unknown';
  return articles.has(ref.id) ? 'real' : 'fabricated';
}

// --- test stories: 7 everyday legal disputes in the corpus's scope, 3 with no legal angle ---
const ASK_LAW = ' 법적으로는 누구 책임인지도 알려 주세요.';
const CASES = [
  {
    id: 'noise',
    legal: true,
    summary:
      '윗집에서 밤 11시가 넘어서도 아이들이 뛰는 소리가 매일 들려요. 관리사무소를 통해 두 번 말했는데 달라진 게 없어요.',
    final: '조용히 해 달라는 것뿐인데 너무 억울해요.' + ASK_LAW,
  },
  {
    id: 'deposit',
    legal: true,
    summary:
      '2년 살던 원룸에서 이사 나가는데, 집주인이 벽지에 작은 얼룩이 있다며 보증금 500만 원을 아직 하나도 안 돌려줘요.',
    final: '얼룩은 도배비 몇만 원이면 될 것 같은데 전부 안 주는 건 너무하다고 생각해요.' + ASK_LAW,
  },
  {
    id: 'loan',
    legal: true,
    summary:
      '친구가 다음 달에 갚겠다고 해서 30만 원을 계좌로 보냈어요. 카톡 기록은 있는데 여섯 달째 곧 줄게라는 말만 해요.',
    final: '친구 사이라 차용증은 안 썼어요. 이제 그만 돌려받고 싶어요.' + ASK_LAW,
  },
  {
    id: 'used-earbuds',
    legal: true,
    summary:
      '중고 거래 앱에서 무선 이어폰을 직거래로 샀는데 집에 와서 보니 한쪽이 안 들려요. 판매자는 팔 때는 정상이었다며 환불을 거부해요.',
    final: '설명에 하자 없음이라고 적혀 있었어요.' + ASK_LAW,
  },
  {
    id: 'dog',
    legal: true,
    summary:
      '공원에서 산책하는데 이웃집 개가 목줄 없이 달려와서 제 바지를 물어 찢었어요. 견주는 우리 개는 원래 안 문다며 사과도 안 했어요.',
    final: '다친 데는 없지만 바지값과 사과는 받고 싶어요.' + ASK_LAW,
  },
  {
    id: 'camera',
    legal: true,
    summary:
      '친구에게 여행 간다고 해서 카메라를 빌려줬는데 렌즈에 금이 간 채로 돌아왔어요. 친구는 원래 있던 흠집 아니냐고 해요.',
    final: '빌려줄 때는 멀쩡했고 사진도 있어요.' + ASK_LAW,
  },
  {
    id: 'used-bike',
    legal: true,
    summary:
      '중고 자전거를 사기로 하고 계약금 3만 원을 보냈는데, 판매자가 더 비싸게 사겠다는 사람에게 팔았다며 3만 원만 돌려줬어요.',
    final: '주말 내내 기다렸는데 허탈해요.' + ASK_LAW,
  },
  {
    id: 'chicken',
    legal: false,
    summary:
      '동생이 제가 먹으려고 남겨둔 마지막 치킨을 말도 없이 먹었어요. 한마디는 물어봤어야 하는 거 아닌가요?',
    final: '다음부터는 먼저 물어봐 줬으면 좋겠어요.',
  },
  {
    id: 'read-receipt',
    legal: false,
    summary:
      '친구 단톡방에서 제가 보낸 메시지에만 아무도 답을 안 하고 읽음 표시만 떠요. 다른 사람 말에는 다들 답하는데요.',
    final: '제가 뭘 잘못했는지 모르겠어요.',
  },
  {
    id: 'dishes',
    legal: false,
    summary:
      '룸메이트와 설거지를 번갈아 하기로 했는데 룸메이트가 자기 차례를 세 번째 미루고 있어요. 싱크대가 꽉 찼어요.',
    final: '규칙을 다시 정하고 싶어요.',
  },
];

const act = (trial, fields) => ({
  requestId: randomUUID(),
  version: trial.version,
  input: '',
  photos: [],
  ...fields,
});
const { GoogleGenAI } = await import('@google/genai');
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Condition C: same model, same pre-RAG rules and case JSON, plus "cite the law". No sources.
const CITE_FROM_MEMORY =
  '\n판결 이유(reasons)에는 이 사건에 적용되는 한국 법령 조문(법령명과 조 번호)과 대법원 판례(사건번호)를 근거로 구체적으로 인용하라.';
async function citeFromMemory(closing, story) {
  const response = await genai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: JSON.stringify({
              trial: { ...closing, legalQuery: undefined, retrieval: undefined },
              operation: 'verdict',
              input: story.final,
            }),
          },
        ],
      },
    ],
    config: {
      systemInstruction: beforeAI.SYSTEM_PROMPT + CITE_FROM_MEMORY,
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: {
          result: { type: 'string' },
          reasons: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        },
        required: ['result', 'reasons'],
      },
      temperature: 0.35,
      thinkingConfig: { thinkingLevel: 'LOW' },
      httpOptions: { timeout: 30000 },
    },
  });
  const v = JSON.parse(response.text || '{}');
  return {
    title: '',
    result: v.result || '',
    reasons: v.reasons || [],
    unresolved: [],
    reconciliation: '',
    lastWord: '',
  };
}
const providerNow = nowAI.createGeminiProvider();
const providerBefore = beforeAI.createGeminiProvider();
const retriever = retrieverFromEnv('gemini');
const verdictText = (v) =>
  [
    v.title,
    v.result,
    ...v.reasons,
    ...v.unresolved,
    v.reconciliation,
    v.lastWord,
    ...(v.sources || []).map((s) => s.why),
  ].join('\n');

async function runVerdict(condition, closing, story, retry = true) {
  tag = `${story.id}:${condition}`;
  const started = performance.now();
  try {
    const trial =
      condition === 'C'
        ? { phase: 'completed', verdict: await citeFromMemory(closing, story) }
        : condition === 'A'
          ? await before.advance(
              { ...structuredClone(closing), legalQuery: undefined, retrieval: undefined },
              act(closing, { type: 'verdict', input: story.final }),
              providerBefore,
            )
          : await now.advance(
              closing,
              act(closing, { type: 'verdict', input: story.final }),
              providerNow,
              retriever,
            );
    const ms = Math.round(performance.now() - started);
    const v = trial.verdict;
    const refs = [];
    for (const ref of findLegalRefs(verdictText(v)))
      refs.push({ ref: formatRef(ref), status: await classify(ref) });
    return { ms, phase: trial.phase, verdict: v, refs, retrieval: trial.retrieval };
  } catch (err) {
    // Provider overload (503/504) is not about the story: wait and try once more.
    if (retry && (err.code === 'AI_BUSY' || err.status === 503 || err.status === 429)) {
      console.log(`${story.id} ${condition}: busy, retrying in 20s`);
      await sleep(20000);
      return runVerdict(condition, closing, story, false);
    }
    return {
      ms: Math.round(performance.now() - started),
      error: err.code || err.message?.slice(0, 120),
    };
  }
}

const results = [];
for (const [i, story] of CASES.entries()) {
  if (ONLY && !ONLY.includes(story.id)) continue;
  tag = `${story.id}:opening`;
  let closing;
  try {
    const opened = await now.createTrial(
      { requestId: randomUUID(), mode: 'plaintiff', title: '', summary: story.summary, photos: [] },
      providerNow,
      'gemini',
    );
    closing = await now.advance(opened, act(opened, { type: 'end' }), providerNow);
  } catch (err) {
    console.log(`${story.id}: opening failed ${err.code || err.message}`);
    results.push({ story, error: err.code || err.message });
    continue;
  }
  const order = [
    ['A', 'B', 'C'],
    ['B', 'C', 'A'],
    ['C', 'A', 'B'],
  ][i % 3];
  const out = { story, title: closing.title, legalQuery: closing.legalQuery };
  for (const condition of order) {
    await sleep(GAP);
    out[condition] = await runVerdict(condition, closing, story);
    const r = out[condition];
    console.log(
      `${story.id.padEnd(13)} ${condition} ${r.error ? `ERROR ${r.error}` : `${r.ms}ms basis=${r.verdict.legalBasis ?? '-'} sources=${(r.verdict.sources || []).map((s) => s.id).join(',') || '-'} refs=${r.refs.map((x) => `${x.ref}[${x.status}]`).join(',') || '-'}`}`,
    );
  }
  results.push(out);
  await sleep(GAP);
}

// --- per-verdict token/cost totals from the recorded calls ---
for (const r of results)
  for (const c of ['A', 'B', 'C']) {
    if (!r[c]) continue;
    const mine = calls.filter((x) => x.tag === `${r.story.id}:${c}`);
    const gen = mine.filter((x) => x.kind === 'generate');
    const price = PRICE['gemini-3.5-flash-lite'];
    const prompt = gen.reduce((n, x) => n + x.prompt, 0);
    const output = gen.reduce((n, x) => n + x.output, 0);
    // embedContent returns no usage; estimate tokens as characters of the query (Korean ≈ 1:1).
    const embedTokens = mine.some((x) => x.kind === 'embed') ? 1500 : 0;
    r[c].usage = {
      modelCalls: gen.length,
      models: [...new Set(gen.map((x) => x.model))],
      promptTokens: prompt,
      outputTokens: output,
      embedCalls: mine.filter((x) => x.kind === 'embed').length,
      usd: (prompt * price.input + output * price.output + embedTokens * PRICE.embedding) / 1e6,
    };
  }
mkdirSync(join(ROOT, 'artifacts'), { recursive: true });
const file = join(
  ROOT,
  `artifacts/rag-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
writeFileSync(file, JSON.stringify({ price: PRICE, results, calls }, null, 2));
console.log(`\nsaved ${file}`);
