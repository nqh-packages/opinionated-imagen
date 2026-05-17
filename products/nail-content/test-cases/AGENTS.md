# AGENTS.md

<!-- markdownlint-disable MD013 -->

## Scope

This folder owns versioned real-life test cases for Nail Content Ekip.

## Rules

- Keep every test case self-contained: inputs, source URLs, prompts, profiles, intentions, variants, outputs, evaluations, and notes live under one folder.
- Treat user-uploaded photos as identity raw material by default, not pose, framing, composition, color, or story truth.
- Treat style-source photos as taste, composition, lens, color, mood, and storytelling reference by default, not identity truth.
- Express creative variation through manifest axes, not vague prompt labels.
- Save every generated output under the variant/run folder that produced it.
- Do not overwrite prior profiles, prompts, outputs, or evaluations. Create a new version instead.
- Do not run profile-building on real Creator identity data or send identity artifacts to a new provider unless the current session explicitly approves it.

## Required Shape

```text
{test-case}/
  manifest.json
  source-url.webloc
  inputs/
    user-uploaded/
    style-source/
    screenshots/
  profiles/
  intentions/
  variants/
  evaluations/
```
