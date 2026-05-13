import { Hono } from 'hono';
import { cors } from 'hono/cors';
import uploadRoutes from './routes/upload';
import profileRoutes from './routes/profile';
import scenesRoutes from './routes/scenes';
import authRoutes from './routes/auth';
import { requireAuth } from './middleware/auth';

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  EMAIL: SendEmail;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_SESSION_TOKEN?: string;
  ACCOUNT_ID: string;
  MAIL_FROM?: string;
  PRODUCT_ID?: string;
  NICHE?: string;
};

type Variables = {
  userId: string;
};

const ALLOWED_ORIGINS = [
  'http://localhost:4321',
  'https://opinionated-imagen.nqh.workers.dev',
];

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors({
  origin: (origin) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return origin;
    return ALLOWED_ORIGINS[1]; // fallback to production origin
  },
  credentials: true,
}));

app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() });
});

// Mount scenes routes
app.route('/api/scenes', scenesRoutes);

// Mount upload routes
app.route('/api/upload', uploadRoutes);

// Mount profile routes
app.route('/api/profile', profileRoutes);

// Mount auth routes
app.route('/api/auth', authRoutes);

// Drop placeholder — auth-gated, returns 501 until fully implemented
const dropApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
dropApp.post('/', requireAuth, (c) => {
  return c.json({ error_code: 'NOT_IMPLEMENTED', message: 'Drop creation is coming soon.' }, 501);
});
app.route('/api/drops', dropApp);

export default app;
