// Step 1/3: downloads the statutes and precedents listed in sources.json, at the pinned commits,
// into .cache/rag/. Re-running skips files already cached; pass --force to download again.
// Usage: npm run rag:fetch
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { cachePath, rawUrl, sourceFiles, ROOT } from './lib.mjs';

const force = process.argv.includes('--force');
let downloaded = 0;
for (const { repo, path } of sourceFiles()) {
  const target = cachePath(repo, path);
  if (existsSync(target) && !force) continue;
  const response = await fetch(rawUrl(repo, path));
  if (!response.ok) throw new Error(`${response.status} ${repo.repo}/${path}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, await response.text());
  downloaded++;
  console.log(`saved ${relative(ROOT, target)}`);
}
console.log(`fetch: ${downloaded} downloaded, ${sourceFiles().length - downloaded} cached`);
