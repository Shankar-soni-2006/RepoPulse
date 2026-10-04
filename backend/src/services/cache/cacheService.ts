import { Redis } from '@upstash/redis';
import { env } from '../../config/env.js';
import type { TimePeriod } from '../../types/index.js';

// Upstash Redis as a read-through cache. Supabase stays the source of truth:
// when Redis is unconfigured, slow or failing, callers get fresh data from the
// database and the request still succeeds.

// Reads sit on the request path: fail fast, but allow a cold TLS reconnect to the
// Upstash endpoint (measured ~200 ms; 500 ms proved too tight right after idle periods).
const READ_TIMEOUT_MS = 1000;
// Invalidation runs after syncs/webhooks with nobody waiting. It must succeed, or users
// see pre-update numbers until the TTL expires, so it gets more time and retries.
const INVALIDATE_TIMEOUT_MS = 3000;
const INVALIDATE_ATTEMPTS = 3;
/** Periods are relative to "now", so entries expire even without invalidation */
export const DEFAULT_TTL_SECONDS = 10 * 60;
const PERIODS: TimePeriod[] = [7, 30, 90];

export type CacheOutcome = 'HIT' | 'MISS' | 'BYPASS';
export type CacheStatus = 'ok' | 'disabled' | 'error';

export const cacheKeys = {
  overview: (repositoryId: string, days: TimePeriod) => `repo:${repositoryId}:overview:${days}`,
  analytics: (repositoryId: string, days: TimePeriod) => `repo:${repositoryId}:analytics:${days}`,
  contributors: (repositoryId: string, days: TimePeriod) => `repo:${repositoryId}:contributors:${days}`,
  /** Every analytics key for a repository, for invalidation */
  allFor: (repositoryId: string) =>
    PERIODS.flatMap((d) => [
      cacheKeys.overview(repositoryId, d),
      cacheKeys.analytics(repositoryId, d),
      cacheKeys.contributors(repositoryId, d),
    ]),
};

interface Clients {
  /** Request path: one attempt, short timeout */
  fast: Redis;
  /** Background invalidation: longer timeout (retried by invalidateRepository) */
  durable: Redis;
}

function createClients(): Clients | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (url || token) console.warn('[cache] both UPSTASH_REDIS_REST_URL and _TOKEN are needed; cache disabled');
    return null;
  }
  return {
    fast: new Redis({
      url,
      token,
      retry: false, // a slow cache must not slow requests down; fall back to the database instead
      enableTelemetry: false,
      signal: () => AbortSignal.timeout(READ_TIMEOUT_MS),
    }),
    durable: new Redis({
      url,
      token,
      // The SDK doesn't retry requests aborted by the signal, so retries are done below
      retry: false,
      enableTelemetry: false,
      signal: () => AbortSignal.timeout(INVALIDATE_TIMEOUT_MS),
    }),
  };
}

let clients: Clients | null | undefined;
const getClients = (): Clients | null => (clients === undefined ? (clients = createClients()) : clients);
const redis = (): Redis | null => getClients()?.fast ?? null;

function warn(op: string, err: unknown): void {
  console.warn(`[cache] ${op} failed; using the database:`, err instanceof Error ? err.message : err);
}

export const cacheService = {
  /**
   * Returns the cached value for `key`, or loads it, caches it and returns it.
   * Redis problems never fail the call: the loader's result is returned uncached.
   */
  async getOrLoad<T>(
    key: string,
    load: () => Promise<T>,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<{ value: T; cache: CacheOutcome }> {
    const r = redis();
    if (!r) return { value: await load(), cache: 'BYPASS' };

    try {
      const cached = await r.get<T>(key);
      if (cached !== null && cached !== undefined) return { value: cached, cache: 'HIT' };
    } catch (err) {
      warn(`GET ${key}`, err);
      return { value: await load(), cache: 'BYPASS' };
    }

    const value = await load();
    try {
      await r.set(key, value, { ex: ttlSeconds });
    } catch (err) {
      warn(`SET ${key}`, err);
    }
    return { value, cache: 'MISS' };
  },

  /** Drops every cached analytics entry for a repository after its data changed. */
  async invalidateRepository(repositoryId: string): Promise<void> {
    const r = getClients()?.durable;
    if (!r) return;
    for (let attempt = 1; attempt <= INVALIDATE_ATTEMPTS; attempt++) {
      try {
        await r.del(...cacheKeys.allFor(repositoryId));
        return;
      } catch (err) {
        if (attempt === INVALIDATE_ATTEMPTS) {
          // Last resort: entries still expire within DEFAULT_TTL_SECONDS
          console.error(
            `[cache] invalidation of ${repositoryId} failed after ${attempt} attempts:`,
            err instanceof Error ? err.message : err,
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
      }
    }
  },

  async status(): Promise<CacheStatus> {
    const r = redis();
    if (!r) return 'disabled';
    try {
      await r.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  },

  /** Tests only: forget the client so env/mocks are re-read. */
  resetForTests(): void {
    clients = undefined;
  },
};
