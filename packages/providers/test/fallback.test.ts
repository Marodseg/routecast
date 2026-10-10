import { err, type ProviderError, type Result, type Route, type RoutingProvider } from '@routecast/shared/providers';
import { describe, expect, it } from 'vitest';
import { CircuitBreaker, type Clock, FallbackRouting, Throttle } from '../src/fallback';
import { signal } from './setup';

const P = { lat: 0, lng: 0 };
const route = (id: string): Route => ({
  id,
  geometry: [P, P],
  distanceM: 1,
  durationS: 1,
  cumDurationS: [0, 1],
  provider: id,
});

function fake(id: string, results: (ProviderError | 'ok')[]): RoutingProvider & { calls: number } {
  let i = 0;
  return {
    id,
    calls: 0,
    async getRoutes(): Promise<Result<Route[]>> {
      this.calls++;
      const r = results[Math.min(i++, results.length - 1)];
      return r === 'ok' || r === undefined ? { ok: true, value: [route(id)] } : err(r);
    },
  };
}

function clock(): Clock & { t: number; slept: number[] } {
  const c = {
    t: 0,
    slept: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.slept.push(ms);
      c.t += ms;
    },
  };
  return c;
}

describe('FallbackRouting', () => {
  it('si el primero falla (429/5xx/timeout), usa el siguiente', async () => {
    const a = fake('a', [{ kind: 'unavailable' }]);
    const b = fake('b', ['ok']);
    const r = await new FallbackRouting([{ provider: a }, { provider: b }], clock()).getRoutes(P, P, {
      alternatives: 2,
      signal: signal(),
    });
    expect(r.ok && r.value[0]?.provider).toBe('b');
  });

  it('«sin ruta» es una respuesta: no se pregunta a otro proveedor', async () => {
    const a = fake('a', [{ kind: 'no_route' }]);
    const b = fake('b', ['ok']);
    const r = await new FallbackRouting([{ provider: a }, { provider: b }], clock()).getRoutes(P, P, {
      alternatives: 2,
      signal: signal(),
    });
    expect(r).toEqual({ ok: false, error: { kind: 'no_route' } });
    expect(b.calls).toBe(0);
  });

  it('todos fallan → devuelve el último error', async () => {
    const r = await new FallbackRouting(
      [
        { provider: fake('a', [{ kind: 'timeout' }]) },
        { provider: fake('b', [{ kind: 'rate_limited', retryAfterS: 5 }]) },
      ],
      clock(),
    ).getRoutes(P, P, { alternatives: 2, signal: signal() });
    expect(r).toEqual({ ok: false, error: { kind: 'rate_limited', retryAfterS: 5 } });
  });

  it('el circuit breaker abre tras 2 fallos y se salta el proveedor hasta pasados 60 s', async () => {
    const c = clock();
    const a = fake('a', [{ kind: 'unavailable' }, { kind: 'unavailable' }, 'ok']);
    const b = fake('b', ['ok']);
    const chain = new FallbackRouting([{ provider: a, breaker: new CircuitBreaker(2, 60_000, c) }, { provider: b }], c);
    await chain.getRoutes(P, P, { alternatives: 0, signal: signal() });
    await chain.getRoutes(P, P, { alternatives: 0, signal: signal() });
    expect(chain.status()[0]?.state).toBe('open');
    await chain.getRoutes(P, P, { alternatives: 0, signal: signal() });
    expect(a.calls).toBe(2);
    c.t += 60_000;
    expect(chain.status()[0]?.state).toBe('half-open');
    const r = await chain.getRoutes(P, P, { alternatives: 0, signal: signal() });
    expect(r.ok && r.value[0]?.provider).toBe('a');
    expect(chain.status()[0]?.state).toBe('closed');
  });

  it('cancelar corta la cadena', async () => {
    const c = new AbortController();
    c.abort();
    const r = await new FallbackRouting([{ provider: fake('a', ['ok']) }], clock()).getRoutes(P, P, {
      alternatives: 0,
      signal: c.signal,
    });
    expect(r).toEqual({ ok: false, error: { kind: 'aborted' } });
  });
});

describe('Throttle', () => {
  it('espacia las peticiones al menos 1 s (≤ 1 req/s a demos públicos)', async () => {
    const c = clock();
    const t = new Throttle(1000, c);
    await t.wait(signal());
    await t.wait(signal());
    await t.wait(signal());
    expect(c.slept).toEqual([0, 1000, 1000]);
  });
});
