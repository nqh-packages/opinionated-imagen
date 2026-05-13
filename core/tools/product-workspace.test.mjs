import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// @rust-exception rationale: this test exercises the Node-based product compiler in the existing Vitest harness without adding a second test toolchain for a small repo-local artifact.

const toolPath = new URL('./product-workspace.mjs', import.meta.url).pathname;

function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'opinionated-imagen-product-workspace-'));
  const productDir = join(root, 'products', 'ig-content');
  mkdirSync(join(productDir, 'scenes'), { recursive: true });
  mkdirSync(join(productDir, 'brand'), { recursive: true });

  writeFileSync(
    join(productDir, 'product.json'),
    JSON.stringify(
      {
        id: 'ig-content',
        name: 'IG Content',
        sourceLocale: 'en',
        gatewayId: 'opinionated-imagen-ig',
        deploy: { script: 'deploy:ig' },
        pricing: { singleDropUsd: 10, monthlyAccessUsd: 29, monthlyDrops: 4 },
        brand: { designedByBrandr: true, brandrUrl: 'https://bybrandr.com' },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(productDir, 'PRODUCT.md'), '# IG Content\n');
  writeFileSync(
    join(productDir, 'CONTEXT.md'),
    '| User sees | Maps to canonical term |\n|---|---|\n| Scene | Preset |\n',
  );
  writeFileSync(join(productDir, 'context.md'), '# Context\n');
  writeFileSync(join(productDir, 'brand', 'copy.json'), '{}\n');
  writeFileSync(join(productDir, 'brand', 'tokens.json'), '{}\n');
  writeFileSync(
    join(productDir, 'scenes', 'cafe-aesthetic.json'),
    JSON.stringify(
      {
        id: 'cafe-aesthetic',
        name: 'Cafe Aesthetic',
        description: 'Relaxed cafe moments',
        baseScene: 'A person sitting at a cafe table.',
        tags: ['warm', 'candid'],
        compositionPlan: [
          { type: 'Seated portrait', ratio: 3 },
          { type: 'Detail shot', ratio: 2 },
        ],
        requiresProductImage: false,
      },
      null,
      2,
    ),
  );

  return root;
}

function runTool(args, root) {
  return spawnSync(process.execPath, [toolPath, ...args, '--root', root], {
    encoding: 'utf8',
  });
}

describe('product workspace compiler', () => {
  it('compiles product workspaces into a Worker-bundled artifact', () => {
    const root = createWorkspace();
    const generatedPath = join(root, 'core', 'functions', 'generated', 'products.ts');

    const result = runTool(['compile'], root);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const generated = readFileSync(generatedPath, 'utf8');
    expect(generated).toContain('ig-content');
    expect(generated).toContain('Cafe Aesthetic');
    expect(generated).toContain('"shotCount": 5');
    expect(generated).toContain('opinionated-imagen-ig');
  });

  it('rejects a product workspace when manifest id and directory name drift', () => {
    const root = createWorkspace();
    const manifestPath = join(root, 'products', 'ig-content', 'product.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.id = 'wrong-id';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = runTool(['validate'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRODUCT_ID_MISMATCH');
    expect(result.stderr).toContain('suggestion=');
  });
});
