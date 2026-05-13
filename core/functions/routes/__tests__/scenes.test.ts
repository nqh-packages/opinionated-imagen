/**
 * Tests: GET /api/scenes
 *
 * Layer: Route contract
 * Risk: Product Workspace drift should not break the Worker with an unstructured error.
 */

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import scenesRoutes from '../scenes';

function createApp(productId?: string) {
  const app = new Hono<{ Bindings: { PRODUCT_ID?: string } }>();
  app.route('/api/scenes', scenesRoutes);
  return { app, env: { PRODUCT_ID: productId } };
}

describe('GET /api/scenes', () => {
  it('returns scenes from the active Product Workspace', async () => {
    const { app, env } = createApp('ig-content');

    const res = await app.request('/api/scenes', {}, env);
    const body = await res.json() as { scenes: { id: string; shotCount: number }[] };

    expect(res.status).toBe(200);
    expect(body.scenes.some((scene) => scene.id === 'cafe-aesthetic' && scene.shotCount === 8)).toBe(true);
  });

  it('returns structured diagnostics when the active Product Workspace is missing', async () => {
    const { app, env } = createApp('missing-product');

    const res = await app.request('/api/scenes', {}, env);
    const body = await res.json() as { error_code: string; context?: { productId?: string } };

    expect(res.status).toBe(503);
    expect(body.error_code).toBe('PRODUCT_WORKSPACE_UNAVAILABLE');
    expect(body.context?.productId).toBe('missing-product');
  });
});
