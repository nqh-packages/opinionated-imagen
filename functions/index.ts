import { Hono } from 'hono';
import { cors } from 'hono/cors';
import uploadRoutes from './routes/upload';
import profileRoutes from './routes/profile';
import scenesRoutes from './routes/scenes';

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  EMAIL: SendEmail;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_SESSION_TOKEN?: string;
  ACCOUNT_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({ origin: '*' }));

app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() });
});

// Mount scenes routes
app.route('/api/scenes', scenesRoutes);

// Mount upload routes
app.route('/api/upload', uploadRoutes);

// Mount profile routes
app.route('/api/profile', profileRoutes);

export default app;
