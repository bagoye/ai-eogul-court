import { RELEASE_LOCK, type RedisClient } from './store.js';

interface Value {
  data: string | Map<string, number>;
  expires?: number;
}

/**
 * In-process stand-in for Upstash that implements only the commands the store sends.
 * Arguments arrive as strings and replies go through JSON, like the REST API.
 * Expiry follows Date.now(), so vi.setSystemTime moves it.
 */
export function createFakeRedis() {
  const keys = new Map<string, Value>();
  let commands = 0;
  const live = (key: string) => {
    const value = keys.get(key);
    if (value?.expires !== undefined && value.expires <= Date.now()) keys.delete(key);
    return keys.get(key);
  };
  const zset = (key: string) => {
    const value = live(key);
    if (value && value.data instanceof Map) return value.data;
    const data = new Map<string, number>();
    keys.set(key, { data });
    return data;
  };
  const counter = (key: string, delta: number) => {
    const value = live(key);
    const next = Number(value?.data ?? 0) + delta;
    keys.set(key, { data: String(next), expires: value?.expires });
    return next;
  };
  function call([name, ...args]: string[]): unknown {
    commands++;
    const [key] = args;
    switch (name) {
      case 'GET': {
        const value = live(key)?.data;
        return typeof value === 'string' ? value : null;
      }
      case 'SET': {
        const flags = args.slice(2).map((a) => a.toUpperCase());
        if (flags.includes('NX') && live(key)) return null;
        const px = flags.indexOf('PX');
        keys.set(key, {
          data: args[1],
          expires: px >= 0 ? Date.now() + Number(args[2 + px + 1]) : undefined,
        });
        return 'OK';
      }
      case 'DEL':
        return args.filter((k) => live(k) && keys.delete(k)).length;
      case 'PEXPIRE': {
        const value = live(key);
        if (!value || (args[2] === 'NX' && value.expires !== undefined)) return 0;
        value.expires = Date.now() + Number(args[1]);
        return 1;
      }
      case 'PTTL': {
        const value = live(key);
        if (!value) return -2;
        return value.expires === undefined ? -1 : value.expires - Date.now();
      }
      case 'INCR':
        return counter(key, 1);
      case 'DECR':
        return counter(key, -1);
      case 'ZADD': {
        const xx = args[1] === 'XX';
        const [score, member] = args.slice(xx ? 2 : 1);
        const set = zset(key);
        if (xx && !set.has(member)) return 0;
        const added = set.has(member) ? 0 : 1;
        set.set(member, Number(score));
        return added;
      }
      case 'ZREMRANGEBYSCORE': {
        const set = live(key)?.data;
        if (!(set instanceof Map)) return 0;
        let removed = 0;
        for (const [member, score] of set)
          if (score <= Number(args[2])) removed += Number(set.delete(member));
        return removed;
      }
      case 'ZCARD': {
        const set = live(key)?.data;
        return set instanceof Map ? set.size : 0;
      }
      case 'EVAL': {
        if (args[0] !== RELEASE_LOCK) throw new Error('Unknown script');
        const [lockKey, token] = args.slice(2);
        return live(lockKey)?.data === token ? Number(keys.delete(lockKey)) : 0;
      }
      default:
        throw new Error(`Fake Redis does not implement ${name}`);
    }
  }
  const client: RedisClient = {
    async exec(batch) {
      const replies = batch.map((command) => call(command.map(String)));
      return JSON.parse(JSON.stringify(replies));
    },
  };
  return { client, keys, commandCount: () => commands };
}
