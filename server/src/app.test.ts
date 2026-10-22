import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { createGeminiProvider, mockProvider } from './ai.js';
import { createRedisStore, type CourtStore } from './store.js';
import { createFakeRedis } from './redis.fake.js';

const data = () => ({
  requestId: randomUUID(),
  mode: 'plaintiff',
  summary: '동생이 제가 남긴 마지막 치킨을 말도 없이 먹어서 서운해요. 약속은 따로 정하지 않았어요.',
});
afterEach(() => vi.unstubAllEnvs());
// Every HTTP behaviour must hold for both stores.
const stores: [string, () => CourtStore | undefined][] = [
  ['memory', () => undefined],
  ['redis', () => createRedisStore(createFakeRedis().client)],
];
describe.each(stores)('HTTP API (%s store)', (_name, newStore) => {
  const make = (options: Parameters<typeof createApp>[0] = {}) =>
    createApp({ store: newStore(), ...options });
  it('creates, restores, ends and completes a trial; repeated request is idempotent', async () => {
    const app = make({ mode: 'mock' });
    const agent = request.agent(app);
    await agent.get('/api/health').expect(200);
    const payload = data();
    const first = await agent.post('/api/trials').send(payload).expect(201);
    const again = await agent.post('/api/trials').send(payload).expect(201);
    expect(again.body.id).toBe(first.body.id);
    const restored = await agent.get(`/api/trials/${first.body.id}`).expect(200);
    expect(restored.body.messages).toEqual(first.body.messages);
    const end = { requestId: randomUUID(), type: 'end', version: 0 };
    const closed = await agent.post(`/api/trials/${first.body.id}/actions`).send(end).expect(200);
    const repeated = await agent.post(`/api/trials/${first.body.id}/actions`).send(end).expect(200);
    expect(repeated.body).toEqual(closed.body);
    const verdict = await agent
      .post(`/api/trials/${first.body.id}/actions`)
      .send({ requestId: randomUUID(), type: 'verdict', version: 1 })
      .expect(200);
    expect(verdict.body.phase).toBe('completed');
  });
  it('rejects parallel mutation without advancing twice', async () => {
    let release: (() => void) | undefined;
    const app = make({
      mode: 'mock',
      provider: async (c) => {
        if (c.operation === 'answer')
          await new Promise<void>((r) => {
            release = r;
          });
        return mockProvider(c);
      },
    });
    const agent = request.agent(app);
    const trial = (await agent.post('/api/trials').send(data())).body;
    const body = {
      requestId: randomUUID(),
      type: 'answer',
      version: 0,
      input: '당시 정한 약속은 없었어요.',
    };
    const first = agent
      .post(`/api/trials/${trial.id}/actions`)
      .send(body)
      .then((r) => r);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await agent
      .post(`/api/trials/${trial.id}/actions`)
      .send({ ...body, requestId: randomUUID() })
      .expect(409);
    release!();
    expect((await first).body.questionCount).toBe(2);
  });
  it('isolates sessions by HttpOnly cookie', async () => {
    const app = make({ mode: 'mock' });
    const agent = request.agent(app);
    const response = await agent.post('/api/trials').send(data());
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    await request(app).get(`/api/trials/${response.body.id}`).expect(404);
    await request(app)
      .post(`/api/trials/${response.body.id}/actions`)
      .send({ requestId: randomUUID(), type: 'end', version: 0 })
      .expect(404);
  });
  it('F: returns explicit missing-key error, never falls back to mock', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const response = await request(make({ provider: createGeminiProvider(), mode: 'gemini' }))
      .post('/api/trials')
      .send(data())
      .expect(503);
    expect(response.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
  it('rejects overly long, short and malformed input', async () => {
    const app = make({ mode: 'mock' });
    await request(app)
      .post('/api/trials')
      .send({ ...data(), summary: '치킨' })
      .expect(400);
    await request(app)
      .post('/api/trials')
      .send({ ...data(), summary: '가'.repeat(5001) })
      .expect(400);
    await request(app)
      .post('/api/trials')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
  });
  it('rejects cross-origin writes and mock production configuration', async () => {
    await request(make({ mode: 'mock' }))
      .post('/api/trials')
      .set('Origin', 'https://untrusted.example')
      .send(data())
      .expect(403);
    expect(() => make({ mode: 'mock', production: true })).toThrow('Mock AI is disabled');
  });
  it('rejects request id reuse with changed payload', async () => {
    const agent = request.agent(make({ mode: 'mock' }));
    const payload = data();
    await agent.post('/api/trials').send(payload).expect(201);
    await agent
      .post('/api/trials')
      .send({ ...payload, title: '다른 내용' })
      .expect(409);
  });
  it('records photo evidence for plaintiffs and rejects invalid or excess photos', async () => {
    const agent = request.agent(make({ mode: 'mock' }));
    const png = { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' };
    const created = await agent
      .post('/api/trials')
      .send({ ...data(), photos: [png, png] })
      .expect(201);
    expect(created.body.evidence).toHaveLength(2);
    expect(created.body.evidence[0]).toMatch(/^사진 1: /);
    expect(JSON.stringify(created.body)).not.toContain(png.data);
    const actions = `/api/trials/${created.body.id}/actions`;
    const answer = { type: 'answer', version: 0, input: '정한 약속은 없었어요.' };
    const tooMany = await agent
      .post(actions)
      .send({ ...answer, requestId: randomUUID(), photos: [png, png] })
      .expect(400);
    expect(tooMany.body.error.code).toBe('PHOTO_LIMIT');
    const fake = { mimeType: 'image/png', data: Buffer.from('<svg></svg>').toString('base64') };
    const invalid = await agent
      .post(actions)
      .send({ ...answer, requestId: randomUUID(), photos: [fake] })
      .expect(400);
    expect(invalid.body.error.code).toBe('INVALID_PHOTO');
    const ok = await agent
      .post(actions)
      .send({ ...answer, requestId: randomUUID(), photos: [png] })
      .expect(200);
    expect(ok.body.evidence).toHaveLength(3);
    expect(ok.body.messages.find((m: { speaker: string }) => m.speaker === 'user').photos).toBe(1);
    const judge = await agent
      .post('/api/trials')
      .send({ requestId: randomUUID(), mode: 'judge', caseId: 'chicken', photos: [png] });
    expect(judge.status).toBe(400);
  });
  it('accepts only the configured APP_ORIGIN in production', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://court.example.com');
    const app = make({ production: true, mode: 'gemini', provider: mockProvider });
    await request(app)
      .post('/api/trials')
      .set('Origin', 'https://other.example.com')
      .send(data())
      .expect(403);
    await request(app)
      .post('/api/trials')
      .set('Origin', 'https://court.example.com')
      .send(data())
      .expect(201);
  });
  it('trusts a configured proxy hop count without globally trusting forwarding headers', () => {
    expect(make({ mode: 'mock' }).get('trust proxy')).toBe(false);
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    expect(make({ mode: 'mock' }).get('trust proxy')).toBe(1);
    vi.stubEnv('TRUST_PROXY_HOPS', 'true');
    expect(() => make({ mode: 'mock' })).toThrow('TRUST_PROXY_HOPS');
  });
});
