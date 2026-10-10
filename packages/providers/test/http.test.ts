import { delay, HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getJson, parseRetryAfter } from '../src/http';
import { server, signal } from './setup';

const URL_ = 'https://api.test/x';
const schema = z.object({ v: z.number() });

describe('parseRetryAfter', () => {
  it('admite segundos y fecha HTTP, y acota a 1 h', () => {
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter('99999')).toBe(3600);
    expect(parseRetryAfter(new Date(10_000 + 30_000).toUTCString(), 10_000)).toBe(30);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('mañana')).toBeUndefined();
  });
});

describe('getJson', () => {
  it('valida y devuelve el cuerpo', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ v: 1 })));
    expect(await getJson(URL_, { schema, signal: signal() })).toEqual({ ok: true, value: { v: 1 } });
  });

  it('429 → rate_limited con Retry-After', async () => {
    server.use(http.get(URL_, () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '12' } })));
    expect(await getJson(URL_, { schema, signal: signal() })).toEqual({
      ok: false,
      error: { kind: 'rate_limited', retryAfterS: 12 },
    });
  });

  it('5xx → unavailable', async () => {
    server.use(http.get(URL_, () => new HttpResponse('caído', { status: 503 })));
    expect(await getJson(URL_, { schema, signal: signal() })).toEqual({
      ok: false,
      error: { kind: 'unavailable', status: 503 },
    });
  });

  it('JSON roto → bad_response', async () => {
    server.use(
      http.get(URL_, () => new HttpResponse('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })),
    );
    const r = await getJson(URL_, { schema, signal: signal() });
    expect(r.ok === false && r.error.kind).toBe('bad_response');
  });

  it('JSON válido pero con un campo raro → bad_response con el camino del error', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ v: 'uno' })));
    const r = await getJson(URL_, { schema, signal: signal() });
    expect(r.ok === false && r.error.kind === 'bad_response' && r.error.detail).toMatch(/^v:/);
  });

  it('4xx con traducción del proveedor', async () => {
    server.use(http.get(URL_, () => HttpResponse.json({ code: 'NoRoute' }, { status: 400 })));
    const r = await getJson(URL_, { schema, signal: signal(), mapClientError: () => ({ kind: 'no_route' }) });
    expect(r).toEqual({ ok: false, error: { kind: 'no_route' } });
  });

  it('timeout → timeout', async () => {
    server.use(
      http.get(URL_, async () => {
        await delay(300);
        return HttpResponse.json({ v: 1 });
      }),
    );
    expect(await getJson(URL_, { schema, signal: signal(), timeoutMs: 30 })).toEqual({
      ok: false,
      error: { kind: 'timeout' },
    });
  });

  it('cancelación externa → aborted (antes y durante)', async () => {
    const pre = new AbortController();
    pre.abort();
    expect(await getJson(URL_, { schema, signal: pre.signal })).toEqual({ ok: false, error: { kind: 'aborted' } });
    server.use(
      http.get(URL_, async () => {
        await delay(300);
        return HttpResponse.json({ v: 1 });
      }),
    );
    const c = new AbortController();
    const p = getJson(URL_, { schema, signal: c.signal });
    setTimeout(() => c.abort(), 20);
    expect(await p).toEqual({ ok: false, error: { kind: 'aborted' } });
  });

  it('error de red → unavailable', async () => {
    server.use(http.get(URL_, () => HttpResponse.error()));
    expect(await getJson(URL_, { schema, signal: signal() })).toEqual({ ok: false, error: { kind: 'unavailable' } });
  });
});
