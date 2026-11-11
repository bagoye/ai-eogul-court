// Step 2/3: turns the cached markdown into retrieval chunks → data/rag/chunks.json.
//  - Statutes: one chunk per article (조). Articles longer than MAX_CHARS split at paragraph (항)
//    boundaries, and every piece keeps the 「law」 article(title) header so it reads on its own.
//  - Precedents: one chunk per numbered issue, pairing 판시사항 [n] with 판결요지 [n] and the
//    statutes it cites. 판례내용 (the full judgment) and 참조판례 are left out on purpose: they are
//    long and noisy, and other case numbers in the prompt would invite citing unretrieved cases.
// Output is deterministic (no timestamps), so re-running on the same commits gives no diff.
// Usage: npm run rag:chunk   (after rag:fetch)
import { readFileSync } from 'node:fs';
import { findLegalRefs } from '../../shared/legal-refs.ts';
import { CHUNKS, SOURCES, cachePath, frontmatter, readJSON, writeJSON } from './lib.mjs';

const MAX_CHARS = 900;
const MAX_PRECEDENT_CHARS = 1500;
const SUMMARY_CHARS = 140;

const sources = readJSON(SOURCES);
const oneLine = (s) => s.replace(/\s+/gu, ' ').trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
// Amendment notes are history, not rules: "<개정 2013.8.13>", "[본조신설 2020.7.31]".
const clean = (s) =>
  s
    .replace(/\*\*/gu, '')
    .replace(/\\\./gu, '.')
    .replace(/<(?:개정|신설|전문개정|제목개정)[^>]*>/gu, '')
    .replace(/\[(?:전문개정|본조신설|제목개정|시행일)[^\]]*\]/gu, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

function statuteChunks({ law, file, groups }) {
  const { meta, body } = frontmatter(readFileSync(cachePath(sources.repos.laws, file), 'utf8'));
  const main = body.split(/^## 부칙/mu)[0];
  const articles = new Map();
  for (const part of main.split(/^(?=##### )/mu).slice(1)) {
    const head = part.match(/^##### 제(\d+)조(?:의(\d+))?(?: \((.*)\))?/u);
    if (!head) continue;
    const num = head[2] ? `${head[1]}의${head[2]}` : head[1];
    // Stop at the next chapter/section heading inside the article block.
    const content = clean(part.slice(head[0].length).split(/^#/mu)[0]);
    articles.set(num, { title: head[3] || '', content });
  }
  const chunks = [];
  for (const { topic, articles: wanted } of groups) {
    for (const num of wanted) {
      const article = articles.get(num);
      if (!article?.content) throw new Error(`${law} 제${num}조 not found in ${file}`);
      const articleName = `제${num.replace('의', '조의')}${num.includes('의') ? '' : '조'}`;
      const label = `「${law}」 ${articleName}`;
      const header = `${label}${article.title ? `(${article.title})` : ''}`;
      // Paragraph groups under the size limit; short articles stay whole.
      const paragraphs = article.content.split(/\n(?=[①-⑳])/u);
      const pieces = [];
      for (const p of paragraphs) {
        const last = pieces.at(-1);
        if (last && last.length + p.length + 1 <= MAX_CHARS)
          pieces[pieces.length - 1] = `${last}\n${p}`;
        else pieces.push(p);
      }
      pieces.forEach((piece, i) => {
        const text = `${header}\n${piece}`;
        chunks.push({
          id: `law-${law.replace(/\s/gu, '')}-${num}${pieces.length > 1 ? `-${i + 1}` : ''}`,
          type: 'statute',
          topic,
          label,
          title: article.title || articleName,
          text,
          summary: clip(oneLine(piece), SUMMARY_CHARS),
          url: `${meta['출처']}/${articleName}`,
          refs: findLegalRefs(text, law),
        });
      });
    }
  }
  return chunks;
}

// "[1] a [2] b" → { 1: 'a', 2: 'b' }; text without markers is item 1.
function items(section = '') {
  const out = {};
  const parts = section.split(/\[(\d+)\]/u);
  if (parts.length === 1) {
    if (oneLine(section)) out[1] = oneLine(section);
    return out;
  }
  for (let i = 1; i < parts.length; i += 2)
    out[parts[i]] = oneLine(parts[i + 1]).replace(/\s*\/\s*$/u, '');
  return out;
}

function precedentChunks({ topic, path, issues }) {
  const { meta, body } = frontmatter(
    readFileSync(cachePath(sources.repos.precedents, path), 'utf8'),
  );
  const section = (name) => body.split(`## ${name}`)[1]?.split(/^## /mu)[0];
  const holdings = items(section('판시사항'));
  const gists = items(section('판결요지'));
  const statutes = items(section('참조조문'));
  const [y, m, d] = meta['선고일자'].split('-').map(Number);
  const caseNo = meta['사건번호'];
  const kind = /\d(마|그|스)\d/u.test(caseNo) ? '결정' : '판결';
  const label = `${meta['법원명']} ${y}. ${m}. ${d}. 선고 ${caseNo} ${kind}`;
  // Filename stem after "court_date_" is a filesystem-safe case key.
  const key = path.split('/').pop().replace(/\.md$/u, '').split('_').slice(2).join('_');
  const wanted = issues || Object.keys(holdings).map(Number);
  return wanted.map((n) => {
    const holding = holdings[n];
    if (!holding) throw new Error(`${path} has no 판시사항 [${n}]`);
    const lines = [
      `${label} — ${meta['사건명']}`,
      `판시사항: ${holding}`,
      gists[n] && `판결요지: ${gists[n]}`,
      (statutes[n] || statutes[1]) && `참조조문: ${statutes[n] || statutes[1]}`,
    ].filter(Boolean);
    const text = clip(lines.join('\n'), MAX_PRECEDENT_CHARS);
    return {
      id: `prec-${key}-${n}`,
      type: 'precedent',
      topic,
      label,
      title: meta['사건명'],
      text,
      summary: clip(holding, SUMMARY_CHARS),
      url: meta['출처'],
      refs: findLegalRefs(text),
    };
  });
}

const chunks = [
  ...sources.statutes.flatMap(statuteChunks),
  ...sources.precedents.flatMap(precedentChunks),
];
const ids = new Set(chunks.map((c) => c.id));
if (ids.size !== chunks.length) throw new Error('duplicate chunk id');
writeJSON(CHUNKS, {
  $comment:
    '생성 파일: npm run rag:chunk. 원문 출처는 각 url(국가법령정보센터)과 sources의 legalize-kr 커밋. 법령·판결은 저작권법 제7조 비보호 저작물.',
  sources: sources.repos,
  chunks,
});
const byTopic = Object.groupBy(chunks, (c) => c.topic);
console.log(
  `chunk: ${chunks.length} chunks (statute ${chunks.filter((c) => c.type === 'statute').length}, precedent ${chunks.filter((c) => c.type === 'precedent').length}), longest ${Math.max(...chunks.map((c) => c.text.length))} chars`,
);
console.log(
  Object.entries(byTopic)
    .map(([t, c]) => `${t} ${c.length}`)
    .join(' · '),
);
