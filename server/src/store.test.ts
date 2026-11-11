import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { mockProvider, type Provider } from './ai.js';
import { createFakeRedis } from './redis.fake.js';
import {
  createRedisStore,
  createUpstashClient,
  LOCK_TTL,
  storeFromEnv,
  TTL,
  type CourtStore,
} from './store.js';

const intake = () => ({
  requestId: randomUUID(),
  mode: 'plaintiff',
  summary: '동생이 제가 남긴 마지막 치킨을 말도 없이 먹어서 서운해요. 약속은 따로 정하지 않았어요.',
});
const MINUTE = 60 * 1000;
// Two app instances sharing one Redis, like two Vercel function instances.
function cluster(provider?: Provider) {
  const redis = createFakeRedis();
  const store = createRedisStore(redis.client);
  const instance = () =>
    createApp({ mode: 'mock', store: createRedisStore(redis.client), provider });
  return { redis, store, a: instance(), b: instance() };
}
const ownerCookie = (response: request.Response) =>
  String(response.headers['set-cookie']).split(';')[0];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Redis store across instances', () => {
  it('continues and replays a trial on another instance', async () => {
    const { a, b } = cluster();
    const payload = intake();
    const created = await request(a).post('/api/trials').send(payload).expect(201);
    const cookie = ownerCookie(created);
    const replay = await request(b).post('/api/trials').set('Cookie', cookie).send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(created.body.id);
    await request(b).get(`/api/trials/${created.body.id}`).set('Cookie', cookie).expect(200);
    const ended = await request(b)
      .post(`/api/trials/${created.body.id}/actions`)
      .set('Cookie', cookie)
      .send({ requestId: randomUUID(), type: 'end', version: 0 })
      .expect(200);
    const restored = await request(a).get(`/api/trials/${created.body.id}`).set('Cookie', cookie);
    expect(restored.body).toEqual(ended.body);
    // Ownership still comes from the cookie, not from which instance answers.
    await request(b).get(`/api/trials/${created.body.id}`).expect(404);
  });

  it('locks a trial across instances and advances it once', async () => {
    let release: (() => void) | undefined;
    const { a, b } = cluster(async (c) => {
      if (c.operation === 'answer')
        await new Promise<void>((r) => {
          release = r;
        });
      return mockProvider(c);
    });
    const created = await request(a).post('/api/trials').send(intake());
    const cookie = ownerCookie(created);
    const actions = `/api/trials/${created.body.id}/actions`;
    const body = { type: 'answer', version: 0, input: '당시 정한 약속은 없었어요.' };
    const first = request(a)
      .post(actions)
      .set('Cookie', cookie)
      .send({ ...body, requestId: randomUUID() })
      .then((r) => r);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const blocked = await request(b)
      .post(actions)
      .set('Cookie', cookie)
      .send({ ...body, requestId: randomUUID() })
      .expect(409);
    expect(blocked.body.error.code).toBe('REQUEST_PENDING');
    release!();
    expect((await first).body.version).toBe(1);
    // The other instance now sees the advanced trial and rejects the stale version.
    const stale = await request(b)
      .post(actions)
      .set('Cookie', cookie)
      .send({ ...body, requestId: randomUUID() })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
  });

  it('keeps trials two hours after the last access and replays results two hours after creation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    const { a, b } = cluster();
    const payload = intake();
    const created = await request(a).post('/api/trials').send(payload).expect(201);
    const cookie = ownerCookie(created);
    const url = `/api/trials/${created.body.id}`;
    vi.setSystemTime(start + TTL - MINUTE);
    await request(b).get(url).set('Cookie', cookie).expect(200);
    vi.setSystemTime(start + 2 * TTL - 2 * MINUTE);
    await request(a).get(url).set('Cookie', cookie).expect(200);
    // The idempotent result is not extended by the reads: the same request now creates anew.
    const again = await request(b).post('/api/trials').set('Cookie', cookie).send(payload);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(created.body.id);
    vi.setSystemTime(start + 3 * TTL);
    const expired = await request(a).get(url).set('Cookie', cookie).expect(404);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('enforces 15 trials per owner and 1000 overall, freeing expired ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { a, b, store } = cluster();
    const first = await request(a).post('/api/trials').send(intake()).expect(201);
    const cookie = ownerCookie(first);
    for (let i = 1; i < 15; i++)
      await request(i % 2 ? b : a)
        .post('/api/trials')
        .set('Cookie', cookie)
        .send(intake())
        .expect(201);
    const full = await request(b).post('/api/trials').set('Cookie', cookie).send(intake());
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe('CAPACITY');
    vi.setSystemTime(Date.now() + TTL + MINUTE);
    await request(a).post('/api/trials').set('Cookie', cookie).send(intake()).expect(201);
    for (let i = 0; i < 999; i++)
      await store.saveTrial(`seed-${i}`, { owner: randomUUID(), trial: first.body });
    const crowded = await request(b).post('/api/trials').send(intake());
    expect(crowded.body.error.code).toBe('CAPACITY');
  });

  it('shares the write rate limit between instances', async () => {
    const { a, b } = cluster();
    for (let i = 0; i < 40; i++)
      await request(i % 2 ? a : b)
        .post('/api/trials')
        .send({})
        .expect(400);
    const limited = await request(a).post('/api/trials').send({}).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMIT');
    expect(limited.headers.ratelimit).toBeDefined();
  });
});

describe('Redis lock', () => {
  it('is exclusive, expires, and is released only by its holder', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const store: CourtStore = createRedisStore(createFakeRedis().client);
    const stale = await store.lock('trial');
    expect(stale).toBeTypeOf('function');
    expect(await store.lock('trial')).toBeUndefined();
    vi.setSystemTime(Date.now() + LOCK_TTL + 1);
    const current = await store.lock('trial');
    expect(current).toBeTypeOf('function');
    await stale!();
    expect(await store.lock('trial')).toBeUndefined();
    await current!();
    expect(await store.lock('trial')).toBeTypeOf('function');
  });
});

describe('Upstash REST client', () => {
  it('sends pipelines and transactions with the bearer token', async () => {
    const fetchMock = vi.fn(async () => Response.json([{ result: 'OK' }, { result: 2 }]));
    vi.stubGlobal('fetch', fetchMock);
    const client = createUpstashClient('https://redis.example.com/', 'secret-token');
    expect(
      await client.exec([
        ['SET', 'k', 'v', 'PX', 1000],
        ['INCR', 'n'],
      ]),
    ).toEqual(['OK', 2]);
    await client.exec([['GET', 'k']], { atomic: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://redis.example.com/pipeline');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(String(init.body))).toEqual([
      ['SET', 'k', 'v', 'PX', '1000'],
      ['INCR', 'n'],
    ]);
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe(
      'https://redis.example.com/multi-exec',
    );
  });

  it('fails without exposing the token', async () => {
    const client = createUpstashClient('https://redis.example.com', 'secret-token');
    vi.stubGlobal('fetch', async () => Response.json({ error: 'WRONGPASS' }, { status: 401 }));
    await expect(client.exec([['GET', 'k']])).rejects.toThrow(/^Redis request failed \(401\)$/);
    vi.stubGlobal('fetch', async () => Response.json([{ error: 'ERR secret-token' }]));
    await expect(client.exec([['GET', 'k']])).rejects.toThrow(/^Redis command failed$/);
  });

  it('turns a Redis outage into the generic server error', async () => {
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    const app = createApp({
      mode: 'mock',
      store: createRedisStore(createUpstashClient('https://redis.example.com', 't')),
    });
    const response = await request(app).post('/api/trials').send(intake()).expect(500);
    expect(response.body.error.code).toBe('SERVER_ERROR');
  });
});

describe('store selection', () => {
  it('uses Redis only when both URL and token are set', () => {
    expect(storeFromEnv({}).kind).toBe('memory');
    expect(storeFromEnv({ KV_REST_API_URL: 'https://r.example.com' }).kind).toBe('memory');
    expect(
      storeFromEnv({ KV_REST_API_URL: 'https://r.example.com', KV_REST_API_TOKEN: 't' }).kind,
    ).toBe('redis');
    expect(
      storeFromEnv({
        UPSTASH_REDIS_REST_URL: 'https://r.example.com',
        UPSTASH_REDIS_REST_TOKEN: 't',
      }).kind,
    ).toBe('redis');
  });
  it('reports the active store in health', async () => {
    const health = await request(
      createApp({ mode: 'mock', store: createRedisStore(createFakeRedis().client) }),
    ).get('/api/health');
    expect(health.body.store).toBe('redis');
    expect((await request(createApp({ mode: 'mock' })).get('/api/health')).body.store).toBe(
      'memory',
    );
  });
});
