import { createHash } from "crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_SECONDS = 60 * 30;

let redisClientPromise: Promise<RedisLike | null> | null = null;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  quit(): Promise<void>;
}

async function getRedisClient(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const mod = await import("ioredis");
        const Redis = mod.default;
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          lazyConnect: true,
        });
        await client.connect();
        return client as unknown as RedisLike;
      } catch {
        redisClientPromise = null;
        return null;
      }
    })();
  }

  return redisClientPromise;
}

function pruneMemoryStore(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

export function cacheKey(namespace: string, payload: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
  return `pp:${namespace}:${hash}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      // Fall through to memory
    }
  }

  pruneMemoryStore();
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Fall through to memory
    }
  }

  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const existing = await cacheGet<T>(key);
  if (existing !== null) {
    return existing;
  }

  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Test helper: clear in-memory cache entries. */
export function clearMemoryCache(): void {
  memoryStore.clear();
}
