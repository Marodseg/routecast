import type { HourlyWeather } from '@routecast/shared';

/** TTL de la previsión en caché (CLAUDE.md regla 6). */
export const WEATHER_TTL_MS = 30 * 60_000;

const DB = 'routecast';
const STORE = 'weather';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = globalThis.indexedDB?.open(DB, 1);
      if (!req) return resolve(null);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Caché de previsión por celda: memoria + IndexedDB. IndexedDB puede no existir o fallar (modo privado):
 * entonces solo memoria. Nunca lanza.
 */
export class WeatherCache {
  readonly #mem = new Map<string, HourlyWeather>();
  #db: Promise<IDBDatabase | null> | null = null;
  constructor(
    readonly now: () => number = Date.now,
    readonly ttlMs = WEATHER_TTL_MS,
    readonly persistent = true,
  ) {}

  #open(): Promise<IDBDatabase | null> {
    if (!this.#db) this.#db = openDb();
    return this.#db;
  }

  #fresh = (h: HourlyWeather | undefined): h is HourlyWeather => !!h && this.now() - h.fetchedAtMs < this.ttlMs;

  async getMany(keys: readonly string[]): Promise<Map<string, HourlyWeather>> {
    const out = new Map<string, HourlyWeather>();
    const missing: string[] = [];
    for (const k of keys) {
      const h = this.#mem.get(k);
      if (this.#fresh(h)) out.set(k, h);
      else missing.push(k);
    }
    if (!missing.length || !this.persistent) return out;
    const db = await this.#open();
    if (!db) return out;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const st = tx.objectStore(STORE);
        for (const k of missing) {
          const r = st.get(k);
          r.onsuccess = () => {
            const h = r.result as HourlyWeather | undefined;
            if (this.#fresh(h)) {
              out.set(k, h);
              this.#mem.set(k, h);
            }
          };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
    return out;
  }

  async putMany(items: readonly HourlyWeather[]): Promise<void> {
    for (const h of items) this.#mem.set(h.cell, h);
    if (!this.persistent) return;
    const db = await this.#open();
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      for (const h of items) tx.objectStore(STORE).put(h, h.cell);
    } catch {
      // Cuota o modo privado: seguimos con memoria.
    }
  }
}
