// Paths and helpers shared by the RAG corpus scripts (fetch → chunk → embed).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SOURCES = join(ROOT, 'scripts/rag/sources.json');
// Raw downloads are a cache (gitignored); chunks.json and index.json are the reviewed outputs.
export const CACHE = join(ROOT, '.cache/rag');
export const CHUNKS = join(ROOT, 'data/rag/chunks.json');
export const INDEX = join(ROOT, 'data/rag/index.json');

export const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));
export function writeJSON(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
export const rawUrl = ({ repo, sha }, path) =>
  `https://raw.githubusercontent.com/${repo}/${sha}/${encodePath(path)}`;
export const cachePath = ({ repo }, path) => join(CACHE, repo.split('/')[1], path);

// Every file the corpus needs, with the pinned repository it comes from.
export function sourceFiles(sources = readJSON(SOURCES)) {
  return [
    ...sources.statutes.map((s) => ({ repo: sources.repos.laws, path: s.file })),
    ...sources.precedents.map((p) => ({ repo: sources.repos.precedents, path: p.path })),
  ];
}

// Splits "---\nkey: value\n---\nbody" into a flat frontmatter object and the body.
export function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('frontmatter not found');
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^'(.*)'$/, '$1');
  }
  return { meta, body: match[2] };
}
