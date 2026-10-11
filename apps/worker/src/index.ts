import {
  areasForBBox,
  type BBoxTuple,
  bboxIntersects,
  fetchAemetArea,
  fetchMeteoalarmSpain,
  mergeWarnings,
  OrsRouting,
  polygonBBox,
} from '@routecast/providers';
import type { ProviderError, Route, Warning } from '@routecast/shared/providers';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { createCache, type TtlCache } from './cache';

interface RateLimiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

export type Env = {
  ALLOWED_ORIGINS: string;
  AEMET_API_KEY?: string | undefined;
  ORS_API_KEY?: string | undefined;
  RATE_LIMITER?: RateLimiter;
};

const UA = 'Routecast/0.1 (proyecto personal no comercial; ver README del repositorio routecast)';
const WARNINGS_TTL_S = 600;
/** Comunidades de AEMET por consulta: acota CPU (10 ms en el plan gratuito) y subrequests. */
const MAX_AREAS = 4;
/** Tope diario propio de ORS por isolate/centro de datos (cuota oficial 2.000/día): best-effort, ver PROVIDERS.md. */
const ORS_DAILY_CAP = 1500;
const ROUTE_TTL_S = 3600;
/** Caja que contiene España peninsular, Baleares, Canarias, Ceuta y Melilla. */
const SPAIN: BBoxTuple = [-19, 27, 5, 44.5];

type AppEnv = { Bindings: Env; Variables: { cache: TtlCache } };

export function createApp(cache: TtlCache = createCache()) {
  const app = new Hono<AppEnv>();

  // CORS restringido a los orígenes configurados (ARCHITECTURE §6). Sin cabecera para orígenes ajenos.
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('Origin');
    const allowed = c.env.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (c.req.method === 'OPTIONS') {
      if (!origin || !allowed.includes(origin)) return c.body(null, 403);
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      });
    }
    if (c.req.method !== 'GET') return c.json({ error: 'method_not_allowed' }, 405);
    await next();
    c.header('Vary', 'Origin');
    if (origin && allowed.includes(origin)) c.header('Access-Control-Allow-Origin', origin);
    c.header('X-Content-Type-Options', 'nosniff');
  });

  // Rate limiting best-effort por IP (el binding es local a cada ubicación y aproximado).
  app.use('/api/*', async (c, next) => {
    if (c.env.RATE_LIMITER && c.req.path !== '/api/health') {
      // Sin IP (solo en local) no se limita: una clave compartida dejaría a todos sin servicio.
      const key = c.req.header('CF-Connecting-IP');
      if (key) {
        const { success } = await c.env.RATE_LIMITER.limit({ key });
        if (!success) return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
      }
    }
    c.set('cache', cache);
    await next();
  });

  // Salud mínima: no se revela qué claves hay configuradas.
  app.get('/api/health', (c) => c.json({ ok: true, service: 'routecast-api' }));

  app.get('/api/warnings', (c) => warnings(c));
  app.get('/api/route', (c) => route(c));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  // Nunca se filtran detalles internos ni claves en errores.
  app.onError((_e, c) => c.json({ error: 'internal' }, 500));
  return app;
}

const num = z.coerce.number().finite();
const fnum = z.number().finite();
const splitNums = (s: string) => s.split(',').map((x) => (x.trim() === '' ? Number.NaN : Number(x)));
const BBoxQuery = z
  .string()
  .max(80)
  .transform(splitNums)
  .pipe(z.tuple([fnum, fnum, fnum, fnum]))
  .refine(([w, s, e, n]) => w < e && s < n && e - w <= 15 && n - s <= 15, 'caja no válida o demasiado grande')
  .refine(([w, s, e, n]) => bboxIntersects([w, s, e, n], SPAIN), 'fuera de cobertura');

const WarningsQuery = z.object({
  bbox: BBoxQuery,
  from: num.optional(),
  to: num.optional(),
});

type SourceStatus = 'ok' | 'error' | 'skipped';
type WarningsResult = { ok: true; value: Warning[] } | { ok: false; error: ProviderError };
/** Peticiones en curso por clave: varias consultas simultáneas comparten una sola descarga. */
const inflight = new Map<string, Promise<WarningsResult>>();

async function warnings(c: Context<AppEnv>) {
  const q = WarningsQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'bad_request' }, 400);
  const bbox = q.data.bbox as BBoxTuple;
  const now = Date.now();
  const from = q.data.from ?? now;
  const to = q.data.to ?? now + 72 * 3_600_000;
  const cache = c.get('cache');
  const signal = AbortSignal.timeout(20_000);
  const areas = areasForBBox(bbox).slice(0, MAX_AREAS);

  const fromCache = (key: string, load: () => Promise<WarningsResult>): Promise<WarningsResult> => {
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = (async (): Promise<WarningsResult> => {
      const hit = await cache.get<Warning[]>(key);
      if (hit) return { ok: true, value: hit };
      // Caché negativa: si la fuente acaba de fallar, no se insiste en cada petición (el 429 es un estado normal).
      const failed = await cache.get<ProviderError>(`${key}:err`);
      if (failed) return { ok: false, error: failed };
      const res = await load();
      if (res.ok) await cache.set(key, res.value, WARNINGS_TTL_S);
      else if (res.error.kind !== 'aborted') {
        const wait = res.error.kind === 'rate_limited' ? Math.min(300, res.error.retryAfterS ?? 60) : 60;
        await cache.set(`${key}:err`, res.error, wait);
      }
      return res;
    })();
    inflight.set(key, p);
    return p.finally(() => inflight.delete(key));
  };

  const aemetKey = c.env.AEMET_API_KEY;
  const [aemetResults, meteoalarm] = await Promise.all([
    aemetKey
      ? Promise.all(
          areas.map((a) =>
            fromCache(`aemet:${a}`, () => fetchAemetArea(a, { apiKey: aemetKey, userAgent: UA }, signal)),
          ),
        )
      : Promise.resolve(null),
    fromCache('meteoalarm:es', () => fetchMeteoalarmSpain({ userAgent: UA }, signal)),
  ]);

  const status: Record<'aemet' | 'meteoalarm', SourceStatus> = {
    aemet: aemetResults === null ? 'skipped' : aemetResults.every((r) => r.ok) ? 'ok' : 'error',
    meteoalarm: meteoalarm.ok ? 'ok' : 'error',
  };
  const lists = [
    ...(aemetResults ?? []).flatMap((r) => (r.ok ? [r.value] : [])),
    meteoalarm.ok ? meteoalarm.value : [],
  ];
  const merged = mergeWarnings(lists).filter(
    (w) =>
      w.toMs >= from && w.fromMs <= to && (w.polygons.length === 0 || bboxIntersects(polygonBBox(w.polygons), bbox)),
  );
  // Sin polígono no se puede situar sobre la ruta: se descarta (la tabla de zonas cubre todas las de AEMET).
  const located = merged.filter((w) => w.polygons.length > 0);

  if (status.aemet !== 'ok' && status.meteoalarm !== 'ok')
    return c.json({ error: 'unavailable', sources: status }, 503);
  return c.json(
    {
      warnings: located,
      partial: status.aemet !== 'ok' || status.meteoalarm !== 'ok',
      sources: status,
      generatedAt: now,
    },
    200,
    { 'Cache-Control': 'public, max-age=300' },
  );
}

const LatLngQuery = z
  .string()
  .max(40)
  .transform(splitNums)
  .pipe(z.tuple([fnum.min(-90).max(90), fnum.min(-180).max(180)]))
  .transform(([lat, lng]) => ({ lat, lng }));

const RouteQuery = z.object({
  from: LatLngQuery,
  to: LatLngQuery,
  alt: z.coerce.number().int().min(0).max(2).default(2),
});

async function route(c: Context<AppEnv>) {
  const key = c.env.ORS_API_KEY;
  if (!key) return c.json({ error: 'unavailable' }, 503);
  const q = RouteQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: 'bad_request' }, 400);
  // Redondeo a ~11 m: la petición y la clave de caché coinciden y la caché sirve de verdad.
  const r4 = (p: { lat: number; lng: number }) => ({ lat: Number(p.lat.toFixed(4)), lng: Number(p.lng.toFixed(4)) });
  const from = r4(q.data.from);
  const to = r4(q.data.to);
  const alt = q.data.alt;
  const inSpain = (p: { lat: number; lng: number }) => bboxIntersects([p.lng, p.lat, p.lng, p.lat], SPAIN);
  if (!inSpain(from) || !inSpain(to)) return c.json({ error: 'out_of_coverage' }, 400);

  const cacheKey = `route:${from.lat},${from.lng};${to.lat},${to.lng};${alt}`;
  const cache = c.get('cache');
  const hit = await cache.get<Route[]>(cacheKey);
  if (hit) return c.json({ routes: hit }, 200, { 'Cache-Control': 'public, max-age=600' });

  // Tope diario propio, por debajo de la cuota oficial: aproximado (la caché no es global), ver PROVIDERS.md.
  const dayKey = `ors:count:${new Date().toISOString().slice(0, 10)}`;
  const used = (await cache.get<number>(dayKey)) ?? 0;
  if (used >= ORS_DAILY_CAP) return c.json({ error: 'unavailable' }, 503);
  await cache.set(dayKey, used + 1, 86_400);

  const res = await new OrsRouting({ apiKey: key }).getRoutes(from, to, {
    alternatives: alt,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const e = res.error;
    if (e.kind === 'no_route') return c.json({ error: 'no_route' }, 404);
    if (e.kind === 'rate_limited')
      return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': String(e.retryAfterS ?? 60) });
    return c.json({ error: 'unavailable' }, 503);
  }
  await cache.set(cacheKey, res.value, ROUTE_TTL_S);
  return c.json({ routes: res.value }, 200, { 'Cache-Control': 'public, max-age=600' });
}

export default createApp();
