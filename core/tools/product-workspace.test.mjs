import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// @rust-exception rationale: this test exercises the Node-based product compiler in the existing Vitest harness without adding a second test toolchain for a small repo-local artifact.

const toolPath = new URL('./product-workspace.mjs', import.meta.url).pathname;

function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'opinionated-imagen-product-workspace-'));
  const productDir = join(root, 'products', 'nail-content');
  mkdirSync(join(productDir, 'scenes'), { recursive: true });
  mkdirSync(join(productDir, 'brand'), { recursive: true });

  writeFileSync(
    join(productDir, 'product.json'),
    JSON.stringify(
      {
        id: 'nail-content',
        name: 'Nail Content Ekip',
        sourceLocale: 'en',
        gatewayId: 'opinionated-imagen-nail',
        deploy: { script: 'deploy:nail' },
        pricing: { singleDropUsd: 10, monthlyAccessUsd: 29, monthlyDrops: 4 },
        brand: { designedByBrandr: true, brandrUrl: 'https://bybrandr.com' },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(productDir, 'PRODUCT.md'), '# Nail Content Ekip\n');
  writeFileSync(
    join(productDir, 'CONTEXT.md'),
    '| User sees | Maps to canonical term |\n|---|---|\n| Scene | Preset |\n',
  );
  writeFileSync(join(productDir, 'context.md'), '# Context\n');
  writeFileSync(join(productDir, 'brand', 'copy.json'), '{}\n');
  writeFileSync(join(productDir, 'brand', 'tokens.json'), '{}\n');
  writeFileSync(
    join(productDir, 'scenes', 'client-result-closeup.json'),
    JSON.stringify(
      {
        id: 'client-result-closeup',
        name: 'Client Result Close-Up',
        description: 'Clean nail result photos',
        baseScene: 'A finished manicure photographed on natural hands.',
        tags: ['result', 'close-up'],
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
    expect(generated).toContain('nail-content');
    expect(generated).toContain('Client Result Close-Up');
    expect(generated).toContain('"shotCount": 5');
    expect(generated).toContain('opinionated-imagen-nail');
  });

  it('rejects a product workspace when manifest id and directory name drift', () => {
    const root = createWorkspace();
    const manifestPath = join(root, 'products', 'nail-content', 'product.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.id = 'wrong-id';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = runTool(['validate'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRODUCT_ID_MISMATCH');
    expect(result.stderr).toContain('suggestion=');
  });

  it('blocks stale generated artifacts', () => {
    const root = createWorkspace();
    const compileResult = runTool(['compile'], root);
    expect(compileResult.status, compileResult.stderr || compileResult.stdout).toBe(0);

    const scenePath = join(root, 'products', 'nail-content', 'scenes', 'client-result-closeup.json');
    const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
    scene.name = 'Changed Scene';
    writeFileSync(scenePath, JSON.stringify(scene, null, 2));

    const result = runTool(['check'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STALE_GENERATED_PRODUCT_ARTIFACT');
    expect(result.stderr).toContain('pnpm product:compile');
  });

  it('blocks legacy niches directory mirrors', () => {
    const root = createWorkspace();
    mkdirSync(join(root, 'niches', 'nail-content'), { recursive: true });

    const result = runTool(['check'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FORBIDDEN_PRODUCT_MIRROR');
  });

  it('blocks derived shotCount in scene source files', () => {
    const root = createWorkspace();
    const scenePath = join(root, 'products', 'nail-content', 'scenes', 'client-result-closeup.json');
    const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
    scene.shotCount = 5;
    writeFileSync(scenePath, JSON.stringify(scene, null, 2));

    const result = runTool(['validate'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SCENE_SOURCE_HAS_DERIVED_FIELD');
  });

  it('passes check when product source and generated artifact match', () => {
    const root = createWorkspace();
    const compileResult = runTool(['compile'], root);
    expect(compileResult.status, compileResult.stderr || compileResult.stdout).toBe(0);

    const result = runTool(['check'], root);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('event=product_workspace_check status=ok');
  });

  it('writes SARIF diagnostics for qlty when product checks fail', () => {
    const root = createWorkspace();
    mkdirSync(join(root, 'niches', 'nail-content'), { recursive: true });
    const outputPath = join(root, 'product-workspace.sarif');

    const result = runTool(['check', '--sarif', '--output', outputPath], root);
    const sarif = JSON.parse(readFileSync(outputPath, 'utf8'));

    expect(result.status).toBe(1);
    expect(sarif.runs[0].results[0].ruleId).toBe('FORBIDDEN_PRODUCT_MIRROR');
    expect(sarif.runs[0].results[0].message.text).toContain('event=product_workspace_validation');
  });
});
