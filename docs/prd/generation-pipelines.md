# Generation Pipelines PRD

<!-- markdownlint-disable MD013 -->

## Why

Opinionated Imagen needs a reusable core for AI generation that can serve many products without copying Krea's user-facing node editor. Krea Nodes proves the useful shape: assets, model steps, costs, runs, and reusable workflows. The product needs that operating model internally, while preserving Opinionated Imagen's canonical language and agent-native architecture.

The first version should make pipelines inspectable and executable by agents before a visual/admin builder exists.

## Product Decision

Build a file-native, agent-first **Generation Pipeline** system.

**Generation Pipeline** is the core engine concept. It is not product-facing copy. Product Workspaces select and configure shared core pipelines, but they do not define product-private Pipeline Steps.

## Goals

- Define reusable core Pipeline Types and shared Pipeline Steps.
- Let Product Workspaces configure pipelines through files.
- Let agents list, read, validate, run, score, compare, and prepare promotion diffs with primitive tools.
- Support provider evaluation before production promotion.
- Keep runtime truth separate from source truth.
- Preserve future compatibility with a visual/admin builder.

## Non-Goals

- No user-facing node editor in v1.
- No user-facing model picker in v1.
- No public workflow/app marketplace in v1.
- No automatic production Provider Route promotion.
- No enhancement/export workflow in the first implementation unless needed by Contact Sheet or profile-building proof.

## Canonical Terms

- **Generation Pipeline**: A reusable, agent-readable execution plan that turns product inputs into generated product artifacts.
- **Pipeline Type**: The declared purpose of a Generation Pipeline.
- **Pipeline Step**: One atomic operation inside a Generation Pipeline.
- **Pipeline Run**: One execution of a Generation Pipeline for one Pack.
- **Provider Route**: The model/provider path selected for a Pipeline Step.

## Pipeline Types

V1 covers:

- `profile-building`: produces or updates a Creator's Identity Profile or Style Profile.
- `evaluation`: compares or scores Provider Routes, Pipeline Steps, or generated artifacts.
- `contact-sheet`: produces a Contact Sheet from an Intention.

Known future type:

- `enhancement`: improves or exports an existing generated artifact.

Future pipeline needs widen the core Pipeline Type taxonomy. Products do not invent private Pipeline Types.

## Source Of Truth

```text
core/pipelines/
  types.json
  steps/
    *.json

products/{product}/pipelines/
  *.json
```

Files own definitions and configuration. D1 owns Pipeline Run and Pipeline Step Run metadata. R2 owns media artifacts.

## V1 Pipeline Definitions

```text
profile-building.identity
  Selfie Set -> Identity Profile

profile-building.style
  Style References or Style Preset -> Style Profile

evaluation
  test fixtures + Provider Routes -> scored comparison

contact-sheet
  confirmed Intention -> Contact Sheet
```

## Agent-Native Capability Map

V1 agent capabilities:

- List Pipeline Types.
- List shared Pipeline Steps.
- Read shared pipeline definitions.
- Read product pipeline configuration.
- Write proposed product pipeline configuration.
- Validate pipeline configuration.
- Estimate pipeline cost.
- List Provider Routes.
- Create evaluation Pipeline Runs with test fixtures.
- Read Pipeline Run status and results.
- Score artifacts.
- Compare Provider Routes.
- Prepare production promotion diffs.
- Complete tasks with evidence.

Future admin UI actions must have equivalent agent tools in the same change.

## Approval Gates

Agents may autonomously:

- Run evaluation Pipeline Runs with synthetic or test fixtures.
- Estimate costs.
- Read and validate pipeline definitions.
- Score artifacts.
- Prepare proposed config diffs.

Approval is required before:

- Promoting a Provider Route to production.
- Changing production `contact-sheet` pipeline configuration.
- Changing `profile-building` pipeline configuration.
- Running profile-building on real Creator Selfie Sets.
- Sending identity/profile artifacts to a new provider.
- Deleting artifacts.
- Changing retention policy.

## Evaluation Rubric

Evaluation uses weighted dimensions plus hard gates.

| Dimension             | Weight |
| --------------------- | ------ |
| identity preservation | 25     |
| photorealism          | 25     |
| intention adherence   | 15     |
| style match           | 10     |
| artifact defects      | 10     |
| composition variety   | 5      |
| cost                  | 5      |
| latency               | 3      |
| retry/failure rate    | 2      |

Hard gates fail a Provider Route when:

- Identity preservation is bad.
- Output looks obviously AI-generated.
- Provider handling of identity data is unacceptable.
- Face, body, or product-critical artifacts are visible.

## Promotion Model

Evaluation can recommend. Promotion requires approval.

```text
Evaluation Pipeline Run
  -> scored artifacts and cost/latency/failure evidence
  -> Promotion Candidate
  -> proposed product pipeline config diff
  -> human approval
  -> production Provider Route change
```

Provider Route statuses:

- `candidate`
- `evaluation-only`
- `production`
- `deprecated`
- `blocked`

## Runtime State

D1 should track:

- Pipeline Runs.
- Pipeline Step Runs.
- Provider Route costs.
- Evaluation scores.
- Status, timing, retries, errors, and cost.

R2 should store:

- Selfie Set artifacts.
- Style References.
- Product Images.
- hidden Identity Profile artifacts.
- Variations.
- enhanced exports.
- evaluation outputs.

## Visual Builder Later

The visual builder should render the same file-native pipeline definitions and D1 run state. It should not become a separate source of truth.

Early visual/admin scope:

- Read-only graph inspection.
- Run status inspection.
- Artifact comparison.
- Promotion candidate review.

Later scope:

- Editable graph UI.
- Drag/drop pipeline editing.
- Public app/workflow publishing if the product ever needs it.
