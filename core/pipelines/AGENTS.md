# AGENTS.md

<!-- markdownlint-disable MD013 -->

## Scope

This folder owns shared Generation Pipeline definitions and Pipeline Step primitives for Opinionated Imagen.

## Rules

- Keep shared Pipeline Types and Pipeline Steps product-agnostic.
- Product-specific selection and configuration belongs in `products/{product}/pipelines/`.
- Do not add product-private Pipeline Steps here. If a product needs a new primitive, widen the shared step catalog with a general name and rationale.
- Do not encode provider secrets, product copy, pricing copy, or user-facing language here.
- Keep files declarative and agent-readable.
- Preserve action parity: anything a future visual builder can do to these definitions must also be possible through agent tools.

## Files

```text
types.json            # Core Pipeline Type taxonomy.
steps/*.json          # Shared Pipeline Step definitions.
```

## Validation

Run these after editing pipeline files until a dedicated pipeline validator exists:

```bash
pnpm product:check
pnpm typecheck
```

## Ownership

Core pipeline definitions are shared engine law. Product Workspaces can configure them, but cannot fork their meaning.
