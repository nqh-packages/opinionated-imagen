# AGENTS.md

<!-- markdownlint-disable MD013 -->

## Product Workspaces

`products/{product}/` is the source of truth for each deployable Opinionated Imagen product. Agents and humans work in the same files. Do not mirror product data into `core/` by hand.

Each product workspace must contain:

```text
product.json
PRODUCT.md
CONTEXT.md
context.md
brand/
  copy.json
  tokens.json
pipelines/
  *.json
test-cases/
  {test-case}/
    manifest.json
    inputs/
scenes/
  *.json
```

## Agent-Native Rules

- Treat each product folder as a shared workspace.
- Use files as primitives: read, edit, validate, compile.
- Keep user-facing language in the product workspace.
- Keep canonical internal domain language in root `CONTEXT.md`.
- Keep runtime code in `core/` product-agnostic.
- Keep shared Generation Pipeline definitions in `core/pipelines/`.
- Keep product-specific Generation Pipeline selection/configuration in `products/{product}/pipelines/`.
- Product workspaces configure shared Pipeline Steps; they do not define custom product-private Pipeline Steps.
- Keep reusable real-life fixtures under `products/{product}/test-cases/`.
- User-uploaded test-case photos are identity raw material by default, not pose/composition truth.
- Style-source test-case photos are taste, composition, color, lens, mood, and storytelling references by default.
- Generated files under `core/functions/generated/` are derived artifacts.

## Commands

```bash
pnpm product:validate
pnpm product:compile
pnpm product:validate ig-content
pnpm product:compile ig-content
```

Run validation after editing `product.json`, `CONTEXT.md`, `brand/`, or `scenes/`. Run compile before Worker runtime verification.

`pnpm product:check` is the blocking Product Workspace gate. It verifies:

- `products/{product}` source files are valid.
- `core/functions/generated/products.ts` is current.
- legacy `niches/` mirrors are absent.
- legacy `core/functions/lib/scenes-data.ts` is absent.
- scene source files do not store derived `shotCount`.

The same gate is exposed through qlty as `product-workspace`.

## Scene Files

Scene JSON files are canonical product content. The compiler derives `shotCount` from `compositionPlan`; do not store `shotCount` in scene source files.

Required fields:

- `id`
- `name`
- `description`
- `baseScene`
- `tags`
- `compositionPlan`
- `requiresProductImage`

## Product Manifest

`product.json` owns deployable product identity:

- product id and display name
- source locale
- AI Gateway id
- deploy script
- pricing
- brandr attribution policy

The `id` must match the directory name.
