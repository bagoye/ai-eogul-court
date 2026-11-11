import { randomUUID } from 'node:crypto';
import type { ClientRateLimitInfo, Options, Store as RateLimitStore } from 'express-rate-limit';
import type { Trial } from '../../shared/types.js';

// Records live for two hours after their last access, as before.
export const TTL = 2 * 60 * 60 * 1000;
// Longer than the worst AI round trip (~45s) and the 60s function limit, so a lock never
// lapses mid-request, yet a crashed instance frees it on its own.
export const LOCK_TTL = 75_000;

export interface Entry {
  owner: string;
  trial: Trial;
}
export interface Completed {
  fingerprint: string;
  result: Trial;
}
export interface CourtStore {
  kind: 'memory' | 'redis';
  sweep(): Promise<void>;
  getTrial(id: string): Promise<Entry | undefined>;
  touchTrial(id: string, owner: string): Promise<void>;
  saveTrial(id: string, entry: Entry): Promise<void>;
  counts(owner: string): Promise<{ total: number; owned: number }>;
  getCompleted(key: string): Promise<Completed | undefined>;
  setCompleted(key: string, value: Completed): Promise<void>;
  getCounter(key: string): Promise<number>;
  /** Adds one; the counter disappears `ttl` ms after its first increment. */
  incrementCounter(key: string, ttl: number): Promise<void>;
  /** Resolves to a release function, or undefined when another request holds the lock. */
  lock(id: string): Promise<(() => Promise<void>) | undefined>;
  /** Undefined keeps express-rate-limit's per-process MemoryStore. */
  rateLimitStore(name: string): RateLimitStore | undefined;
}

export function createMemoryStore(): CourtStore {
  const sessions = new Map<string, Entry & { touched: number }>();
  const completed = new Map<string, Completed & { touched: number }>();
  const locks = new Set<string>();
  const counters = new Map<string, { count: number; expires: number }>();
  return {
    kind: 'memory',
    async sweep() {
      const now = Date.now();
      for (const [id, entry] of sessions) if (now - entry.touched > TTL) sessions.delete(id);
      for (const [key, entry] of completed) if (now - entry.touched > TTL) completed.delete(key);
      for (const [key, entry] of counters) if (now >= entry.expires) counters.delete(key);
    },
    async getTrial(id) {
      return sessions.get(id);
    },
    async touchTrial(id) {
      const entry = sessions.get(id);
      if (entry) entry.touched = Date.now();
    },
    async saveTrial(id, entry) {
      sessions.set(id, { ...entry, touched: Date.now() });
    },
    async counts(owner) {
      return {
        total: sessions.size,
        owned: [...sessions.values()].filter((s) => s.owner === owner).length,
      };
    },
    async getCompleted(key) {
      return completed.get(key);
    },
    async setCompleted(key, value) {
      completed.set(key, { ...value, touched: Date.now() });
    },
    async getCounter(key) {
      return counters.get(key)?.count ?? 0;
    },
    async incrementCounter(key, ttl) {
      const entry = counters.get(key);
      if (entry) entry.count++;
      else counters.set(key, { count: 1, expires: Date.now() + ttl });
    },
    async lock(id) {
      if (locks.has(id)) return undefined;
      locks.add(id);
      return async () => {
        locks.delete(id);
      };
    },
    rateLimitStore: () => undefined,
  };
}

export type RedisCommand = (string | number)[];
export interface RedisClient {
  /** Runs commands in one round trip; `atomic` wraps them in MULTI/EXEC. */
  exec(commands: RedisCommand[], options?: { atomic?: boolean }): Promise<unknown[]>;
}

// Upstash's REST API needs only fetch, so no Redis SDK is bundled.
export function createUpstashClient(url: string, token: string): RedisClient {
  const base = url.replace(/\/+$/, '');
  return {
    async exec(commands, { atomic = false } = {}) {
      const response = await fetch(`${base}/${atomic ? 'multi-exec' : 'pipeline'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands.map((command) => command.map(String))),
        signal: AbortSignal.timeout(5000),
      });
      const replies = (await response.json().catch(() => null)) as
        { result?: unknown; error?: string }[] | null;
      // Keep the token and stored records out of error messages.
      if (!response.ok || !Array.isArray(replies))
        throw new Error(`Redis request failed (${response.status})`);
      return replies.map((reply) => {
        if (reply.error) throw new Error('Redis command failed');
        return reply.result;
      });
    },
  };
}

export const RELEASE_LOCK =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const PREFIX = 'court:';
const ALL = `${PREFIX}idx:all`;
const trialKey = (id: string) => `${PREFIX}trial:${id}`;
const ownerKey = (owner: string) => `${PREFIX}idx:owner:${owner}`;

export function createRedisStore(redis: RedisClient): CourtStore {
  const run = async (...command: RedisCommand) => (await redis.exec([command]))[0];
  // The indexes score each trial by its expiry so counts can drop lapsed trials.
  const index = (id: string, owner: string, xx: boolean): RedisCommand[] => {
    const expires = Date.now() + TTL;
    const flag = xx ? ['XX'] : [];
    return [
      ['ZADD', ALL, ...flag, expires, id],
      ['ZADD', ownerKey(owner), ...flag, expires, id],
      ['PEXPIRE', ownerKey(owner), TTL],
    ];
  };
  return {
    kind: 'redis',
    // Keys expire by TTL; nothing to sweep.
    async sweep() {},
    async getTrial(id) {
      const raw = await run('GET', trialKey(id));
      return typeof raw === 'string' ? (JSON.parse(raw) as Entry) : undefined;
    },
    async touchTrial(id, owner) {
      await redis.exec([['PEXPIRE', trialKey(id), TTL], ...index(id, owner, true)], {
        atomic: true,
      });
    },
    async saveTrial(id, entry) {
      await redis.exec(
        [['SET', trialKey(id), JSON.stringify(entry), 'PX', TTL], ...index(id, entry.owner, false)],
        { atomic: true },
      );
    },
    async counts(owner) {
      const now = Date.now();
      const [, , total, owned] = await redis.exec(
        [
          ['ZREMRANGEBYSCORE', ALL, '-inf', now],
          ['ZREMRANGEBYSCORE', ownerKey(owner), '-inf', now],
          ['ZCARD', ALL],
          ['ZCARD', ownerKey(owner)],
        ],
        { atomic: true },
      );
      return { total: Number(total), owned: Number(owned) };
    },
    async getCompleted(key) {
      const raw = await run('GET', `${PREFIX}done:${key}`);
      return typeof raw === 'string' ? (JSON.parse(raw) as Completed) : undefined;
    },
    async setCompleted(key, value) {
      // Not refreshed on replay, matching the in-memory store.
      await run('SET', `${PREFIX}done:${key}`, JSON.stringify(value), 'PX', TTL);
    },
    async getCounter(key) {
      return Number((await run('GET', `${PREFIX}count:${key}`)) ?? 0);
    },
    async incrementCounter(key, ttl) {
      await redis.exec(
        [
          ['INCR', `${PREFIX}count:${key}`],
          ['PEXPIRE', `${PREFIX}count:${key}`, ttl, 'NX'],
        ],
        { atomic: true },
      );
    },
    async lock(id) {
      const key = `${PREFIX}lock:${id}`;
      const token = randomUUID();
      if ((await run('SET', key, token, 'NX', 'PX', LOCK_TTL)) !== 'OK') return undefined;
      return async () => {
        // A failed release must not replace the request's result; the lock expires anyway.
        await run('EVAL', RELEASE_LOCK, 1, key, token).catch(() => undefined);
      };
    },
    rateLimitStore: (name) => new RedisRateLimitStore(redis, `${PREFIX}rl:${name}:`),
  };
}

// Fixed-window counter shared by every instance, same semantics as the default MemoryStore.
class RedisRateLimitStore implements RateLimitStore {
  localKeys = false;
  private windowMs = 60000;
  constructor(
    private redis: RedisClient,
    public prefix: string,
  ) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const [hits, , ttl] = await this.redis.exec(
      [
        ['INCR', this.prefix + key],
        ['PEXPIRE', this.prefix + key, this.windowMs, 'NX'],
        ['PTTL', this.prefix + key],
      ],
      { atomic: true },
    );
    return { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) };
  }
  async decrement(key: string) {
    await this.redis.exec([['DECR', this.prefix + key]]);
  }
  async resetKey(key: string) {
    await this.redis.exec([['DEL', this.prefix + key]]);
  }
}

// Vercel's Upstash integration injects KV_REST_API_*; Upstash's own console uses UPSTASH_*.
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): CourtStore {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? createRedisStore(createUpstashClient(url, token)) : createMemoryStore();
}
