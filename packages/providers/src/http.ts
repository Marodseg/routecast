import { err, ok, type ProviderError, type Result } from '@routecast/shared/providers';
import type { z } from 'zod';

export interface GetJsonOptions<S extends z.ZodType> {
  schema: S;
  signal: AbortSignal;
  /** Por defecto 10 s. */
  timeoutMs?: number;
  init?: RequestInit;
  /** Traduce respuestas 4xx con cuerpo propio del proveedor (p. ej. «sin ruta») a un error de dominio. */
  mapClientError?: (status: number, body: unknown) => ProviderError | undefined;
  fetchImpl?: typeof fetch;
}

/** `Retry-After` en segundos o fecha HTTP → segundos (acotado a 1 h). */
export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(3600, secs);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(3600, Math.max(0, Math.round((at - nowMs) / 1000))) : undefined;
}

const issueText = (e: z.ZodError): string => {
  const first = e.issues[0];
  return first ? `${first.path.join('.') || '(raíz)'}: ${first.message}` : 'esquema no válido';
};

/**
 * GET (o lo que diga `init`) con timeout, cancelación y validación Zod. Todo error esperado vuelve como `Result`:
 * la red y los proveedores fallan a menudo y la UI debe degradar, no romperse (CLAUDE.md regla 4).
 */
export async function getJson<S extends z.ZodType>(url: string, o: GetJsonOptions<S>): Promise<Result<z.infer<S>>> {
  if (o.signal.aborted) return err({ kind: 'aborted' });
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, o.timeoutMs ?? 10_000);
  const onAbort = () => ctrl.abort();
  o.signal.addEventListener('abort', onAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await (o.fetchImpl ?? fetch)(url, { ...o.init, signal: ctrl.signal });
    } catch {
      if (o.signal.aborted) return err({ kind: 'aborted' });
      if (timedOut) return err({ kind: 'timeout' });
      return err({ kind: 'unavailable' });
    }

    if (res.status === 429) {
      const retryAfterS = parseRetryAfter(res.headers.get('retry-after'));
      return err(retryAfterS === undefined ? { kind: 'rate_limited' } : { kind: 'rate_limited', retryAfterS });
    }
    if (res.status >= 500) return err({ kind: 'unavailable', status: res.status });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (o.signal.aborted) return err({ kind: 'aborted' });
      if (timedOut) return err({ kind: 'timeout' });
      return err({ kind: 'bad_response', detail: `HTTP ${res.status}: cuerpo no es JSON` });
    }
    if (res.status >= 400) {
      return err(o.mapClientError?.(res.status, body) ?? { kind: 'bad_response', detail: `HTTP ${res.status}` });
    }

    const parsed = o.schema.safeParse(body);
    return parsed.success ? ok(parsed.data) : err({ kind: 'bad_response', detail: issueText(parsed.error) });
  } finally {
    clearTimeout(timer);
    o.signal.removeEventListener('abort', onAbort);
  }
}

export interface GetBytesOptions {
  signal: AbortSignal;
  timeoutMs?: number;
  init?: RequestInit;
  fetchImpl?: typeof fetch;
  /** Tamaño máximo aceptado (bytes): una respuesta desmesurada es un error, no un cuelgue. */
  maxBytes?: number;
}

/** Como `getJson` pero devuelve el cuerpo en bruto (tar de AEMET, XML de Meteoalarm). */
export async function getBytes(url: string, o: GetBytesOptions): Promise<Result<Uint8Array>> {
  if (o.signal.aborted) return err({ kind: 'aborted' });
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, o.timeoutMs ?? 15_000);
  const onAbort = () => ctrl.abort();
  o.signal.addEventListener('abort', onAbort, { once: true });
  const fail = (): Result<never> =>
    err(o.signal.aborted ? { kind: 'aborted' } : timedOut ? { kind: 'timeout' } : { kind: 'unavailable' });
  try {
    let res: Response;
    try {
      res = await (o.fetchImpl ?? fetch)(url, { ...o.init, signal: ctrl.signal });
    } catch {
      return fail();
    }
    if (res.status === 429) {
      const retryAfterS = parseRetryAfter(res.headers.get('retry-after'));
      return err(retryAfterS === undefined ? { kind: 'rate_limited' } : { kind: 'rate_limited', retryAfterS });
    }
    if (res.status >= 500) return err({ kind: 'unavailable', status: res.status });
    // Con redirect: 'manual' una redirección llega como 3xx (u opaca, status 0): no se sigue.
    if (res.status >= 300 || res.status === 0) {
      return err({ kind: 'bad_response', detail: `HTTP ${res.status}` });
    }
    const max = o.maxBytes ?? Number.POSITIVE_INFINITY;
    const declared = Number(res.headers.get('content-length'));
    const tooBig = (n: number): Result<never> =>
      err({ kind: 'bad_response', detail: `respuesta de más de ${max} B (${n} B)` });
    if (Number.isFinite(declared) && declared > max) return tooBig(declared);
    // Lectura en streaming con contador: un cuerpo desmesurado se corta sin cargarlo entero en memoria.
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      const reader = res.body?.getReader();
      if (!reader) return ok(new Uint8Array(await res.arrayBuffer()));
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
          await reader.cancel();
          return tooBig(total);
        }
        chunks.push(value);
      }
    } catch {
      return fail();
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return ok(out);
  } finally {
    clearTimeout(timer);
    o.signal.removeEventListener('abort', onAbort);
  }
}
