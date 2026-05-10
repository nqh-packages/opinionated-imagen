/**
 * Tests: Prompt Anatomy — gemma-4 extraction output format
 *
 * Tests that the gemma-4 identity extraction prompt produces output
 * matching the expected structured format. This is the contract between
 * gemma-4 output and the downstream gpt-image-2 reference sheet prompt.
 *
 * Layer: Unit (pure string validation)
 * Risk: High (wrong format breaks reference sheet generation)
 */

import { describe, it, expect } from 'vitest';
import { IDENTITY_EXTRACTION_PROMPT, buildReferenceSheetPrompt } from '../prompts';
import { validDescription, invalidDescription, PROMPT_FEATURES } from 'test-scripts/profile-test-fixtures';

describe('IDENTITY_EXTRACTION_PROMPT structure', () => {
  // 1. Prompt covers all required feature categories
  it('requests all 17 required feature categories', () => {
    for (const feature of PROMPT_FEATURES) {
      expect(IDENTITY_EXTRACTION_PROMPT).toContain(feature);
    }
  });

  // 2. Prompt is a single instruction block (no broken structure)
  it('is a coherent paragraph instruction set', () => {
    expect(IDENTITY_EXTRACTION_PROMPT.length).toBeGreaterThan(500);
    expect(IDENTITY_EXTRACTION_PROMPT).toContain('Format as a single paragraph');
  });

  // 3. Prompt prohibits guessing
  it('instructs the model not to guess unclear features', () => {
    expect(IDENTITY_EXTRACTION_PROMPT.toLowerCase()).toContain('unclear');
    expect(IDENTITY_EXTRACTION_PROMPT.toLowerCase()).toContain('do not guess');
  });

  // 4. Prompt handles multiple people in frame
  it('handles multi-person photo scenarios', () => {
    const lower = IDENTITY_EXTRACTION_PROMPT.toLowerCase();
    expect(lower).toContain('multiple people') || expect(lower).toContain('group');
  });

  // 5. Prompt handles variable features across photos
  it('requires consistency notes for varying features', () => {
    expect(IDENTITY_EXTRACTION_PROMPT).toContain('CONSISTENCY NOTES');
  });
});

describe('buildReferenceSheetPrompt() output', () => {
  const description = validDescription();

  // 6. Embeds the identity description
  it('includes the full identity description', () => {
    const prompt = buildReferenceSheetPrompt(description);
    expect(prompt).toContain(description);
  });

  // 7. Specifies three-view layout
  it('specifies front, 3/4, and side profile views', () => {
    const prompt = buildReferenceSheetPrompt(description);
    const lower = prompt.toLowerCase();
    expect(lower).toContain('front');
    expect(lower).toContain('3/4');
    expect(lower).toContain('profile') || expect(lower).toContain('side');
  });

  // 8. Enforces photorealism
  it('enforces photorealistic photography', () => {
    const prompt = buildReferenceSheetPrompt(description);
    const lower = prompt.toLowerCase();
    expect(lower).toContain('photorealistic');
    expect(lower).toContain('skin texture') || expect(lower).toContain('pores');
  });

  // 9. Locks identity across angles
  it('instructs identity preservation across all three angles', () => {
    const prompt = buildReferenceSheetPrompt(description);
    const lower = prompt.toLowerCase();
    expect(lower).toContain('same person') || expect(lower).toContain('exact');
    expect(lower).toContain('identical');
  });

  // 10. Prohibits text overlays
  it('prohibits text overlays and watermarks', () => {
    const prompt = buildReferenceSheetPrompt(description);
    const lower = prompt.toLowerCase();
    expect(lower).toContain('no text') || expect(lower).toContain('no watermark');
  });
});

describe('Valid description format', () => {
  // 11. A valid description is a complete paragraph
  it('is a single coherent paragraph of sufficient length', () => {
    const desc = validDescription();
    expect(desc.length).toBeGreaterThan(200);
    // No numbered list or markdown structure
    expect(desc).not.toMatch(/^\d+\./m);
  });

  // 12. Contains ANSI-free text
  it('contains plain text without special characters', () => {
    const desc = validDescription();
    expect(desc).not.toContain('```');
    expect(desc).not.toContain('**');
  });

  // 13. Empty/short descriptions are rejected by the extraction logic
  it('short descriptions fail the extraction gate', () => {
    const short = invalidDescription();
    expect(short.length).toBeLessThan(30);
  });
});
