import {
  err,
  type LatLng,
  type ProviderError,
  type Result,
  type Route,
  type RoutingProvider,
} from '@routecast/shared/providers';

export interface Clock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      if (ms <= 0 || signal.aborted) return resolve();
      const t = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    }),
};

/** Circuit breaker simple: abre tras `threshold` fallos seguidos y deja probar de nuevo pasado `coolDownMs`. */
export class CircuitBreaker {
  #fails = 0;
  #openedAt: number | null = null;
  #coolDown: number;
  constructor(
    readonly threshold = 2,
    readonly coolDownMs = 60_000,
    readonly clock: Pick<Clock, 'now'> = realClock,
  ) {
    this.#coolDown = coolDownMs;
  }

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.#openedAt === null) return 'closed';
    return this.clock.now() - this.#openedAt >= this.#coolDown ? 'half-open' : 'open';
  }

  canTry(): boolean {
    return this.state !== 'open';
  }

  success(): void {
    this.#fails = 0;
    this.#openedAt = null;
  }

  /** Si el proveedor pidió esperar (Retry-After), el circuito no se reabre antes. */
  failure(retryAfterS?: number): void {
    this.#fails++;
    if (this.state === 'half-open' || this.#fails >= this.threshold || retryAfterS !== undefined) {
      this.#openedAt = this.clock.now();
      this.#coolDown = Math.max(this.coolDownMs, (retryAfterS ?? 0) * 1000);
    }
  }
}

/** Espaciado mínimo entre peticiones a un mismo demo público (≤ 1 req/s, PROVIDERS.md). */
export class Throttle {
  #next = 0;
  constructor(
    readonly minIntervalMs = 1000,
    readonly clock: Clock = realClock,
  ) {}

  async wait(signal: AbortSignal): Promise<void> {
    const now = this.clock.now();
    const at = Math.max(now, this.#next);
    this.#next = at + this.minIntervalMs;
    await this.clock.sleep(at - now, signal);
  }
}

/** Errores tras los que tiene sentido probar el siguiente proveedor. */
const RETRYABLE: ReadonlySet<ProviderError['kind']> = new Set([
  'rate_limited',
  'unavailable',
  'timeout',
  'bad_response',
]);

export interface FallbackEntry {
  provider: RoutingProvider;
  breaker?: CircuitBreaker;
  throttle?: Throttle;
}

/**
 * Cadena de proveedores de rutas (ARCHITECTURE §4.1). El orden y los límites son configuración.
 * «Sin ruta» y «cancelado» no se reintentan en otro proveedor: son respuestas, no fallos.
 */
export class FallbackRouting implements RoutingProvider {
  readonly id = 'fallback';
  readonly #chain: Required<FallbackEntry>[];

  constructor(chain: FallbackEntry[], clock: Clock = realClock) {
    this.#chain = chain.map((e) => ({
      provider: e.provider,
      breaker: e.breaker ?? new CircuitBreaker(2, 60_000, clock),
      throttle: e.throttle ?? new Throttle(1000, clock),
    }));
  }

  /** Estado para la UI («usando servidor de respaldo»). */
  status(): { id: string; state: CircuitBreaker['state'] }[] {
    return this.#chain.map((e) => ({ id: e.provider.id, state: e.breaker.state }));
  }

  async getRoutes(
    from: LatLng,
    to: LatLng,
    opts: { alternatives: number; signal: AbortSignal },
  ): Promise<Result<Route[]>> {
    let last: ProviderError = { kind: 'unavailable' };
    for (const e of this.#chain) {
      if (opts.signal.aborted) return err({ kind: 'aborted' });
      if (!e.breaker.canTry()) continue;
      await e.throttle.wait(opts.signal);
      if (opts.signal.aborted) return err({ kind: 'aborted' });
      const res = await e.provider.getRoutes(from, to, opts);
      if (res.ok) {
        e.breaker.success();
        return res;
      }
      if (!RETRYABLE.has(res.error.kind)) return res;
      e.breaker.failure(res.error.kind === 'rate_limited' ? res.error.retryAfterS : undefined);
      last = res.error;
    }
    return err(last);
  }
}
