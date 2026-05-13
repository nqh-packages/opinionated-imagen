/**
 * Scene routes — GET /api/scenes returns the curated Scene catalog.
 */

import { Hono } from 'hono';
import { getProductWorkspace } from '../generated/products';
import { serviceUnavailable } from '../lib/diagnostics';

type Bindings = {
  PRODUCT_ID?: string;
  NICHE?: string;
};

const scenesApp = new Hono<{ Bindings: Bindings }>();

/**
 * GET /api/scenes
 *
 * Returns all curated Scenes with name, description, compositionPlan, tags,
 * and computed shotCount. Data is loaded from the bundled TypeScript module,
 * not from D1 (the D1 scenes table exists for schema completeness only).
 */
scenesApp.get('/', async (c) => {
  const productId = c.env.PRODUCT_ID ?? c.env.NICHE ?? 'ig-content';

  try {
    const workspace = getProductWorkspace(productId);
    return c.json({ scenes: workspace.scenes }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown product workspace error';
    return c.json(
      serviceUnavailable('PRODUCT_WORKSPACE_UNAVAILABLE', 'Active product workspace is not available.', {
        productId,
        error: message,
      }),
      503,
    );
  }
});

export default scenesApp;
