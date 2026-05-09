/**
 * Scene definitions — the canonical catalog of curated Scenes.
 *
 * This TypeScript data module is bundled with the Worker and served
 * via GET /api/scenes. The JSON files in niches/ig-content/scenes/
 * are the design-level canonical source; this module mirrors them
 * so wrangler bundles the data correctly.
 *
 * When adding a new scene, update this module AND create a corresponding
 * JSON file in niches/ig-content/scenes/ for the design record.
 */

export interface CompositionShot {
  type: string;
  ratio: number;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  baseScene: string;
  tags: string[];
  compositionPlan: CompositionShot[];
  requiresProductImage: boolean;
  shotCount: number;
}

function computeShotCount(plan: CompositionShot[]): number {
  return plan.reduce((sum, shot) => sum + shot.ratio, 0);
}

const rawScenes: Omit<Scene, 'shotCount'>[] = [
  {
    id: 'cafe-aesthetic',
    name: 'Cafe Aesthetic',
    description: 'Relaxed cafe moments — coffee, window light, candid',
    baseScene:
      'A person sitting at a cafe table with a coffee cup, bathed in natural window light. Warm tones, film-like grain, soft shadows. The scene captures an intimate, unhurried moment — the kind of photo that feels like a memory more than a setup.',
    tags: ['warm', 'candid'],
    compositionPlan: [
      { type: 'Seated portrait', ratio: 3 },
      { type: 'Candid over-shoulder', ratio: 2 },
      { type: 'Detail shot (hands, cup, steam)', ratio: 2 },
      { type: 'Wide environment', ratio: 1 },
    ],
    requiresProductImage: false,
  },
  {
    id: 'coffee-shop-meeting',
    name: 'Coffee Shop Meeting',
    description: 'Casual work meetup — laptops, conversation, city energy',
    baseScene:
      'Two people at a corner table in a busy coffee shop. Laptops open, coffee cups between them — the energy of a productive working session in a buzzing city space. Natural mixed lighting: fluorescent overheads bleeding into afternoon window light.',
    tags: ['urban', 'casual'],
    compositionPlan: [
      { type: 'Two-shot conversation', ratio: 3 },
      { type: 'Over-shoulder on laptop screen', ratio: 2 },
      { type: 'Wide establishing (room context)', ratio: 2 },
      { type: 'Detail — hands typing, coffee cup', ratio: 1 },
    ],
    requiresProductImage: false,
  },
  {
    id: 'golden-hour-portrait',
    name: 'Golden Hour Portrait',
    description: 'Warm sunset light, outdoor setting, natural glow',
    baseScene:
      'A solo portrait shot during golden hour — that 20-minute window where the sun paints everything amber and soft. The Creator stands in open shade near a warm-lit wall, catching the directional sidelight. Warm skin tones, long shadows, subtle lens flare.',
    tags: ['outdoor', 'golden-hour'],
    compositionPlan: [
      { type: 'Full-body environmental', ratio: 2 },
      { type: 'Three-quarter portrait', ratio: 3 },
      { type: 'Close-up (face, catchlights)', ratio: 2 },
      { type: 'Detail — light on texture', ratio: 1 },
    ],
    requiresProductImage: false,
  },
];

export const scenes: Scene[] = rawScenes.map((scene) => ({
  ...scene,
  shotCount: computeShotCount(scene.compositionPlan),
}));
