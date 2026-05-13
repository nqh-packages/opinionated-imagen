# Context

## Who I Am

IG Content is the first Opinionated Imagen product workspace.

## What Exists

- Product source: `products/ig-content/`
- Scene catalog: `products/ig-content/scenes/`
- User-facing vocabulary: `products/ig-content/CONTEXT.md`
- Market vision: `products/ig-content/PRODUCT.md`

## Agent Guidelines

- Treat this folder as the source of truth for the IG Content product.
- Keep market-facing language here, not in `core/`.
- Run `pnpm product:validate ig-content` after changing product files.
- Run `pnpm product:compile ig-content` before Worker runtime verification.
