import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { CASES } from '../../shared/cases.js';
import type { Trial } from '../../shared/types.js';
import { createGeminiProvider, mockProvider, type Provider } from './ai.js';
import { intakeSchema, actionSchema, createTrial, advance } from './engine.js';
import { AppError } from './errors.js';
import { storeFromEnv, TTL, type CourtStore } from './store.js';

export function createApp(
  options: {
    provider?: Provider;
    mode?: 'gemini' | 'mock';
    production?: boolean;
    store?: CourtStore;
    // Off on Vercel, where the CDN serves client/dist.
    serveClient?: boolean;
  } = {},
) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const mode = options.mode || (process.env.AI_MODE === 'mock' ? 'mock' : 'gemini');
  if (production && mode === 'mock') throw new Error('Mock AI is disabled in production');
  const provider = options.provider || (mode === 'mock' ? mockProvider : createGeminiProvider());
  const store = options.store || storeFromEnv();
  const app = express();
  app.disable('x-powered-by');
  const proxyHops = process.env.TRUST_PROXY_HOPS;
  if (proxyHops) {
    if (!/^[1-5]$/.test(proxyHops)) throw new Error('TRUST_PROXY_HOPS must be between 1 and 5');
    app.set('trust proxy', Number(proxyHops));
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  // Trial writes may carry up to three downsized photos; everything else stays small.
  app.use('/api/trials', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const rateLimitStore = (name: string) => {
    const limitStore = store.rateLimitStore(name);
    return limitStore ? { store: limitStore } : {};
  };
  const limitMessage = {
    error: { code: 'RATE_LIMIT', message: '요청이 잠시 많습니다. 1분 후 다시 시도해 주세요.' },
  };
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 180,
      ...rateLimitStore('all'),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 40,
      skip: (req) => req.method === 'GET',
      ...rateLimitStore('write'),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
  );
  app.use('/api', async (req, res, next) => {
    // Same-origin browser writes only. No cross-origin CORS permission.
    const origin = req.get('origin');
    const expected = process.env.APP_ORIGIN || (production ? undefined : 'http://localhost:5173');
    if (
      req.method !== 'GET' &&
      origin &&
      origin !== expected &&
      !(!production && origin === 'http://127.0.0.1:5173')
    )
      return next(new AppError(403, 'ORIGIN', '허용되지 않은 요청입니다.'));
    const cookie = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('court_owner='))
      ?.slice(12);
    const owner = cookie && /^[a-f0-9-]{36}$/.test(cookie) ? cookie : randomUUID();
    if (owner !== cookie)
      res.cookie('court_owner', owner, {
        httpOnly: true,
        sameSite: 'strict',
        secure: production,
        maxAge: TTL,
        path: '/api',
      });
    res.locals.owner = owner;
    await store.sweep();
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      aiMode: mode,
      configured: mode === 'mock' || !!process.env.GEMINI_API_KEY,
      store: store.kind,
    }),
  );
  app.get('/api/cases', (_req, res) => res.json(CASES));
  app.get('/api/trials/:id', async (req, res, next) => {
    const entry = await store.getTrial(req.params.id);
    if (!entry || entry.owner !== res.locals.owner)
      return next(
        new AppError(
          404,
          'SESSION_EXPIRED',
          '재판 기록이 만료되었거나 서버가 다시 시작되었습니다. 새 사건을 접수해 주세요.',
        ),
      );
    await store.touchTrial(req.params.id, entry.owner);
    res.json(entry.trial);
  });
  async function mutate(
    owner: string,
    requestId: string,
    lockId: string,
    payload: unknown,
    work: () => Promise<Trial>,
  ) {
    const key = `${owner}:${requestId}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const replay = async () => {
      const saved = await store.getCompleted(key);
      if (saved && saved.fingerprint !== fingerprint)
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          '요청 식별자가 다른 내용에 사용되었습니다.',
        );
      return saved?.result;
    };
    const saved = await replay();
    if (saved) return saved;
    const release = await store.lock(lockId);
    if (!release)
      throw new AppError(409, 'REQUEST_PENDING', '이전 요청이 진행 중입니다. 잠시 기다려 주세요.');
    try {
      // Another instance may have finished this request between the check and the lock.
      const done = await replay();
      if (done) return done;
      const result = await work();
      await store.setCompleted(key, { fingerprint, result });
      return result;
    } finally {
      await release();
    }
  }
  app.post('/api/trials', async (req, res) => {
    const data = intakeSchema.parse(req.body);
    const owner = res.locals.owner as string;
    const result = await mutate(owner, data.requestId, `create:${owner}`, data, async () => {
      const { total, owned } = await store.counts(owner);
      if (total >= 1000 || owned >= 15)
        throw new AppError(
          429,
          'CAPACITY',
          '진행 중인 재판이 많습니다. 잠시 후 다시 접수해 주세요.',
        );
      const trial = await createTrial(data, provider, mode);
      await store.saveTrial(trial.id, { owner, trial });
      return trial;
    });
    res.status(201).json(result);
  });
  app.post('/api/trials/:id/actions', async (req, res) => {
    const data = actionSchema.parse(req.body);
    const owner = res.locals.owner as string;
    const missing = () =>
      new AppError(
        404,
        'SESSION_EXPIRED',
        '재판 기록을 찾을 수 없습니다. 새 사건을 접수해 주세요.',
      );
    const entry = await store.getTrial(req.params.id);
    if (!entry || entry.owner !== owner) throw missing();
    const result = await mutate(
      owner,
      data.requestId,
      req.params.id,
      { ...data, trialId: req.params.id },
      async () => {
        // Re-read under the lock: another instance may have advanced the trial meanwhile.
        const current = await store.getTrial(req.params.id);
        if (!current || current.owner !== owner) throw missing();
        const trial = await advance(current.trial, data, provider);
        await store.saveTrial(req.params.id, { owner, trial });
        return trial;
      },
    );
    res.json(result);
  });
  if (options.serveClient ?? production) {
    const staticDir = fileURLToPath(new URL('../../../../client/dist/', import.meta.url));
    app.use(express.static(staticDir));
    app.get('/{*path}', (req, res, next) =>
      req.path.startsWith('/api/') ? next() : res.sendFile(path.join(staticDir, 'index.html')),
    );
  }
  app.use('/api', (_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', '요청한 경로가 없습니다.')),
  );
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof AppError)
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      if (err instanceof z.ZodError)
        return res.status(400).json({
          error: {
            code: 'VALIDATION',
            message: '입력 형식과 길이를 확인해 주세요. 사연은 5,000자, 답변은 3,000자까지입니다.',
          },
        });
      if ((err as { type?: string }).type === 'entity.too.large')
        return res.status(413).json({
          error: {
            code: 'TOO_LARGE',
            message: '입력이 너무 큽니다. 내용을 줄이거나 사진 수를 줄여 주세요.',
          },
        });
      if (err instanceof SyntaxError)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_JSON', message: '올바른 JSON 요청이 아닙니다.' } });
      // Do not log raw SDK errors, prompts, keys, or personal stories.
      res.status(500).json({
        error: {
          code: 'SERVER_ERROR',
          message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
      });
    },
  );
  return app;
}
