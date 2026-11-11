import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
  rewrites: { source: string; destination: string }[];
};
const directives = (csp: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .sort();
// Headers Express itself or the rate limiter adds, not helmet.
const notSecurity =
  /^(content-type|content-length|etag|cache-control|set-cookie|date|connection|keep-alive|ratelimit.*)$/;

describe('vercel.json', () => {
  it('gives CDN-served pages the same security headers helmet sends', async () => {
    const response = await request(createApp({ mode: 'mock', production: false })).get(
      '/api/health',
    );
    const helmet = Object.fromEntries(
      Object.entries(response.headers).filter(([name]) => !notSecurity.test(name)),
    );
    const page = config.headers.find((h) => h.source === '/((?!api/).*)')!;
    const vercel = Object.fromEntries(page.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(Object.keys(vercel).sort()).toEqual(Object.keys(helmet).sort());
    for (const [name, value] of Object.entries(vercel))
      if (name === 'content-security-policy')
        expect(directives(value)).toEqual(directives(String(helmet[name])));
      else expect(value).toBe(helmet[name]);
  });
  it('routes the API to the function before the SPA fallback', () => {
    expect(config.rewrites[0]).toEqual({ source: '/api/(.*)', destination: '/api' });
    expect(config.rewrites.at(-1)?.destination).toBe('/index.html');
  });
});
