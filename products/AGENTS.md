# AGENTS.md

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
scenes/
  *.json
```

## Agent-Native Rules

- Treat each product folder as a shared workspace.
- Use files as primitives: read, edit, validate, compile.
- Keep user-facing language in the product workspace.
- Keep canonical internal domain language in root `CONTEXT.md`.
- Keep runtime code in `core/` product-agnostic.
- Generated files under `core/functions/generated/` are derived artifacts.

## Commands

```bash
pnpm product:validate
pnpm product:compile
pnpm product:validate ig-content
pnpm product:compile ig-content
```

Run validation after editing `product.json`, `CONTEXT.md`, `brand/`, or `scenes/`. Run compile before Worker runtime verification.

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
