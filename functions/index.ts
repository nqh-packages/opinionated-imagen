import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  EMAIL: SendEmail;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({ origin: '*' }));

app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() });
});

app.get('/api/presets', async (c) => {
  const presets = [
    {
      id: 'cafe-aesthetic',
      name: 'Cafe Aesthetic',
      description: 'Relaxed cafe moments — coffee, window light, candid',
      baseScene: 'A person sitting at a cafe table with a coffee cup, natural window light',
      compositionPlan: [
        { type: 'seated-portrait', ratio: 3 },
        { type: 'candid-over-shoulder', ratio: 2 },
        { type: 'detail-shot', ratio: 2 },
        { type: 'wide-environment', ratio: 1 },
      ],
      defaultStyleTags: ['warm', 'film-like', 'soft shadows'],
      requiresProductImage: false,
    },
  ];
  return c.json({ presets });
});

export default app;
