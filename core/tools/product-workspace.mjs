#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// @rust-exception rationale: this compiler emits TypeScript into the existing Worker module graph and must run inside the current pnpm/Node build path without adding a second toolchain for a small repo-local artifact.

const REQUIRED_PRODUCT_FILES = ['product.json', 'PRODUCT.md', 'CONTEXT.md', 'context.md'];
const REQUIRED_BRAND_FILES = ['copy.json', 'tokens.json'];

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? 'validate';
  let root = process.cwd();
  let productId = null;
  let sarif = false;
  let output = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--root') {
      root = resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--sarif') {
      sarif = true;
    } else if (arg === '--output') {
      output = resolve(args[i + 1]);
      i += 1;
    } else if (!arg.startsWith('--') && productId === null) {
      productId = arg;
    }
  }

  return { command, root, productId, sarif, output };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw productError('INVALID_JSON', path, error instanceof Error ? error.message : 'unknown JSON error');
  }
}

function productError(code, path, message, suggestion = 'fix the product workspace source file and rerun product validation') {
  const details = {
    event: 'product_workspace_validation',
    code,
    path,
    message,
    suggestion,
  };
  const error = new Error(
    `event=product_workspace_validation code=${code} path=${path} message=${JSON.stringify(message)} suggestion=${JSON.stringify(suggestion)}`,
  );
  error.code = code;
  error.details = details;
  return error;
}

function assertString(value, path, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw productError('MISSING_STRING_FIELD', path, `product.json field "${field}" must be a non-empty string`);
  }
}

function assertNumber(value, path, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw productError('MISSING_NUMBER_FIELD', path, `product.json field "${field}" must be a finite number`);
  }
}

function assertFileExists(path) {
  if (!existsSync(path)) {
    throw productError('MISSING_PRODUCT_FILE', path, 'required product workspace file is missing');
  }
}

function readScene(path) {
  const scene = readJson(path);
  if (Object.hasOwn(scene, 'shotCount')) {
    throw productError(
      'SCENE_SOURCE_HAS_DERIVED_FIELD',
      path,
      'scene source files must not store derived shotCount',
      'remove shotCount from the scene JSON; the Product Workspace compiler derives it from compositionPlan',
    );
  }
  for (const field of ['id', 'name', 'description', 'baseScene']) {
    assertString(scene[field], path, field);
  }
  if (!Array.isArray(scene.tags) || scene.tags.some((tag) => typeof tag !== 'string')) {
    throw productError('INVALID_SCENE_TAGS', path, 'scene.tags must be an array of strings');
  }
  if (!Array.isArray(scene.compositionPlan) || scene.compositionPlan.length === 0) {
    throw productError('INVALID_COMPOSITION_PLAN', path, 'scene.compositionPlan must be a non-empty array');
  }
  for (const shot of scene.compositionPlan) {
    if (typeof shot.type !== 'string' || typeof shot.ratio !== 'number') {
      throw productError('INVALID_COMPOSITION_SHOT', path, 'each composition shot must include string type and number ratio');
    }
  }
  if (typeof scene.requiresProductImage !== 'boolean') {
    throw productError('INVALID_PRODUCT_IMAGE_FLAG', path, 'scene.requiresProductImage must be boolean');
  }

  const shotCount = scene.compositionPlan.reduce((sum, shot) => sum + shot.ratio, 0);
  return { ...scene, shotCount };
}

function readProduct(root, productDir) {
  const productPath = join(productDir, 'product.json');
  for (const file of REQUIRED_PRODUCT_FILES) assertFileExists(join(productDir, file));
  for (const file of REQUIRED_BRAND_FILES) assertFileExists(join(productDir, 'brand', file));

  const manifest = readJson(productPath);
  const productId = basename(productDir);
  if (manifest.id !== productId) {
    throw productError(
      'PRODUCT_ID_MISMATCH',
      productPath,
      `product.json id "${manifest.id}" must match directory "${productId}"`,
      'rename the directory or update product.json id so agents have one stable product identity',
    );
  }

  assertString(manifest.id, productPath, 'id');
  assertString(manifest.name, productPath, 'name');
  assertString(manifest.sourceLocale, productPath, 'sourceLocale');
  assertString(manifest.gatewayId, productPath, 'gatewayId');
  assertString(manifest.deploy?.script, productPath, 'deploy.script');
  assertNumber(manifest.pricing?.singleDropUsd, productPath, 'pricing.singleDropUsd');
  assertNumber(manifest.pricing?.monthlyAccessUsd, productPath, 'pricing.monthlyAccessUsd');
  assertNumber(manifest.pricing?.monthlyDrops, productPath, 'pricing.monthlyDrops');
  assertString(manifest.brand?.brandrUrl, productPath, 'brand.brandrUrl');

  const scenesDir = join(productDir, 'scenes');
  if (!existsSync(scenesDir)) {
    throw productError('MISSING_SCENES_DIR', scenesDir, 'product workspace must include a scenes directory');
  }

  const sceneFiles = readdirSync(scenesDir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  if (sceneFiles.length === 0) {
    throw productError('EMPTY_SCENE_CATALOG', scenesDir, 'product workspace must include at least one scene');
  }

  const scenes = sceneFiles.map((file) => readScene(join(scenesDir, file)));

  return {
    manifest,
    files: {
      product: relativeFromRoot(root, join(productDir, 'PRODUCT.md')),
      context: relativeFromRoot(root, join(productDir, 'CONTEXT.md')),
      agentContext: relativeFromRoot(root, join(productDir, 'context.md')),
      brandCopy: relativeFromRoot(root, join(productDir, 'brand', 'copy.json')),
      brandTokens: relativeFromRoot(root, join(productDir, 'brand', 'tokens.json')),
    },
    scenes,
  };
}

function relativeFromRoot(root, path) {
  return path.slice(root.length + 1);
}

function loadProducts(root, productId = null) {
  const productsRoot = join(root, 'products');
  if (!existsSync(productsRoot)) {
    throw productError('MISSING_PRODUCTS_DIR', productsRoot, 'products directory is required');
  }

  const productDirs = readdirSync(productsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (!productId || entry.name === productId))
    .map((entry) => join(productsRoot, entry.name))
    .sort();

  if (productDirs.length === 0) {
    throw productError('PRODUCT_NOT_FOUND', productsRoot, `no product workspace matched "${productId ?? '*'}"`);
  }

  return Object.fromEntries(productDirs.map((dir) => {
    const product = readProduct(root, dir);
    return [product.manifest.id, product];
  }));
}

function formatTsValue(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const next = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => `${next}${formatTsValue(item, indent + 2)}`).join(',\n')},\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([key, entryValue]) => `${next}${JSON.stringify(key)}: ${formatTsValue(entryValue, indent + 2)}`).join(',\n')},\n${pad}}`;
  }
  return JSON.stringify(value);
}

function compile(root, productId = null) {
  const products = loadProducts(root, productId);
  const generatedDir = join(root, 'core', 'functions', 'generated');
  mkdirSync(generatedDir, { recursive: true });
  const outputPath = join(generatedDir, 'products.ts');
  const content = buildGeneratedProducts(products);
  writeFileSync(outputPath, content);
  return { products: Object.keys(products), outputPath };
}

function validate(root, productId = null) {
  return { products: Object.keys(loadProducts(root, productId)) };
}

function buildGeneratedProducts(products) {
  return `/* Generated by core/tools/product-workspace.mjs. Do not edit by hand. */\n\nexport const productWorkspaces = ${formatTsValue(products)} as const;\n\nexport type ProductId = keyof typeof productWorkspaces;\nexport type ProductWorkspace = (typeof productWorkspaces)[ProductId];\nexport type ProductScene = ProductWorkspace['scenes'][number];\n\nexport function getProductWorkspace(productId: string = 'ig-content'): ProductWorkspace {\n  const workspace = productWorkspaces[productId as ProductId];\n  if (!workspace) {\n    throw new Error(\`Unknown product workspace: \${productId}\`);\n  }\n  return workspace;\n}\n`;
}

function checkNoForbiddenPaths(root) {
  const forbiddenPaths = [
    join(root, 'niches'),
    join(root, 'core', 'functions', 'lib', 'scenes-data.ts'),
  ];

  for (const path of forbiddenPaths) {
    if (existsSync(path)) {
      throw productError(
        'FORBIDDEN_PRODUCT_MIRROR',
        path,
        'product source must live under products/{product} with generated runtime artifacts only',
        'move product content into products/{product} and consume it through core/functions/generated/products.ts',
      );
    }
  }
}

function checkGeneratedArtifact(root, productId = null) {
  const products = loadProducts(root, productId);
  const outputPath = join(root, 'core', 'functions', 'generated', 'products.ts');
  const expected = buildGeneratedProducts(products);
  if (!existsSync(outputPath)) {
    throw productError(
      'MISSING_GENERATED_PRODUCT_ARTIFACT',
      outputPath,
      'compiled Product Workspace artifact is missing',
      'run pnpm product:compile and commit the generated artifact',
    );
  }

  const actual = readFileSync(outputPath, 'utf8');
  if (actual !== expected) {
    throw productError(
      'STALE_GENERATED_PRODUCT_ARTIFACT',
      outputPath,
      'compiled Product Workspace artifact is stale',
      'run pnpm product:compile and commit the generated artifact',
    );
  }

  return { products: Object.keys(products), outputPath };
}

function check(root, productId = null) {
  checkNoForbiddenPaths(root);
  return checkGeneratedArtifact(root, productId);
}

function sarifForError(error) {
  const details = error instanceof Error && error.details ? error.details : {
    code: 'PRODUCT_WORKSPACE_CHECK_FAILED',
    path: 'products',
    message: error instanceof Error ? error.message : String(error),
    suggestion: 'inspect product workspace validation output',
  };

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'product-workspace',
          informationUri: 'products/AGENTS.md',
          rules: [{
            id: details.code,
            shortDescription: { text: details.code },
            fullDescription: { text: details.message },
            help: { text: details.suggestion },
          }],
        },
      },
      results: [{
        ruleId: details.code,
        level: 'error',
        message: {
          text: `event=product_workspace_validation code=${details.code} message=${details.message} suggestion=${details.suggestion}`,
        },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: details.path },
            region: { startLine: 1 },
          },
        }],
      }],
    }],
  };
}

function emptySarif() {
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'product-workspace', informationUri: 'products/AGENTS.md', rules: [] } },
      results: [],
    }],
  };
}

function writeSarif(path, sarif) {
  if (path) {
    writeFileSync(path, `${JSON.stringify(sarif, null, 2)}\n`);
  } else {
    console.log(JSON.stringify(sarif, null, 2));
  }
}

function main() {
  const { command, root, productId, sarif, output } = parseArgs(process.argv.slice(2));
  try {
    if (command === 'validate') {
      const result = validate(root, productId);
      if (sarif) writeSarif(output, emptySarif());
      console.log(`event=product_workspace_validate status=ok products=${result.products.join(',')}`);
      return;
    }
    if (command === 'compile') {
      const result = compile(root, productId);
      if (sarif) writeSarif(output, emptySarif());
      console.log(`event=product_workspace_compile status=ok products=${result.products.join(',')} output=${result.outputPath}`);
      return;
    }
    if (command === 'check') {
      const result = check(root, productId);
      if (sarif) writeSarif(output, emptySarif());
      console.log(`event=product_workspace_check status=ok products=${result.products.join(',')} output=${result.outputPath}`);
      return;
    }
    throw productError('UNKNOWN_COMMAND', command, `unknown command "${command}"`, 'use validate, compile, or check');
  } catch (error) {
    if (sarif) writeSarif(output, sarifForError(error));
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) main();

export { check, compile, loadProducts, validate };
