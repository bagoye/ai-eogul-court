import assert from 'node:assert/strict';
import { createApp } from '../server/dist/server/src/app.js';

const server = createApp({ production: true, mode: 'gemini' }).listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<title>AI 억울법정/);
  assert.match(home.headers.get('content-security-policy'), /default-src/);
  const script = html.match(/src="([^"]+\.js)"/)[1];
  const bundle = await fetch(base + script);
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('content-type'), /javascript/);
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).aiMode, 'gemini');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const route = await fetch(base + '/intake/judge');
  assert.equal(route.status, 200);
  assert.match(await route.text(), /<title>AI 억울법정/);
  const missing = await fetch(base + '/api/nonexistent');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  console.log('Production smoke passed: HTML, JS assets, SPA route, API, headers, and 404.');
} finally {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
