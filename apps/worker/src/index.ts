import { Hono } from 'hono';

export type Env = {
  ALLOWED_ORIGINS: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'routecast-api' }));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
