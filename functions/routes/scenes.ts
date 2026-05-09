/**
 * Scene routes — GET /api/scenes returns the curated Scene catalog.
 */

import { Hono } from 'hono';
import { scenes } from '../lib/scenes-data';

const scenesApp = new Hono();

/**
 * GET /api/scenes
 *
 * Returns all curated Scenes with name, description, compositionPlan, tags,
 * and computed shotCount. Data is loaded from the bundled TypeScript module,
 * not from D1 (the D1 scenes table exists for schema completeness only).
 */
scenesApp.get('/', async (c) => {
  return c.json({ scenes }, 200);
});

export default scenesApp;
