import { describe, expect, it } from 'vitest';
import app from '../src/index';

const env = { ALLOWED_ORIGINS: 'http://localhost:5173' };

describe('worker', () => {
  it('GET /api/health responde ok', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'routecast-api' });
  });

  it('rutas desconocidas devuelven 404 JSON', async () => {
    const res = await app.request('/nope', {}, env);
    expect(res.status).toBe(404);
  });
});
