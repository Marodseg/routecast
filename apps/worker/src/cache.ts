/**
 * Caché en dos capas: memoria del isolate (siempre disponible, también en *.workers.dev) y Cache API del centro de
 * datos cuando existe. Nada de KV: su cuota gratuita de escrituras es mínima (ARCHITECTURE §6).
 */
export interface TtlCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlS: number): Promise<void>;
}

const CACHE_HOST = 'https://routecast-cache.internal/';

export function createCache(
  now: () => number = Date.now,
  edge: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default,
): TtlCache {
  const mem = new Map<string, { exp: number; value: unknown }>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const hit = mem.get(key);
      if (hit && hit.exp > now()) return hit.value as T;
      if (hit) mem.delete(key);
      if (!edge) return undefined;
      try {
        const res = await edge.match(CACHE_HOST + encodeURIComponent(key));
        if (!res) return undefined;
        const body = (await res.json()) as { exp?: unknown; value?: T };
        if (typeof body.exp !== 'number' || body.exp <= now() || body.value === undefined) return undefined;
        mem.set(key, { exp: body.exp, value: body.value });
        return body.value;
      } catch {
        return undefined;
      }
    },
    async set<T>(key: string, value: T, ttlS: number): Promise<void> {
      const entry = { exp: now() + ttlS * 1000, value };
      mem.set(key, entry);
      if (mem.size > 200) mem.delete(mem.keys().next().value as string);
      if (!edge) return;
      try {
        await edge.put(
          CACHE_HOST + encodeURIComponent(key),
          new Response(JSON.stringify(entry), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttlS}` },
          }),
        );
      } catch {
        // La caché del borde es un extra: si falla, seguimos con la de memoria.
      }
    },
  };
}
