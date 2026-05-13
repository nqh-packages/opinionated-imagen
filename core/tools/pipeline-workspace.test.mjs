import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// @rust-exception rationale: this test exercises the Node-based pipeline validator in the existing Vitest harness without adding a second test toolchain for a small repo-local artifact.

const toolPath = new URL("./pipeline-workspace.mjs", import.meta.url).pathname;

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createWorkspace() {
  const root = mkdtempSync(
    join(tmpdir(), "opinionated-imagen-pipeline-workspace-"),
  );
  const corePipelinesDir = join(root, "core", "pipelines");
  const stepsDir = join(corePipelinesDir, "steps");
  const productDir = join(root, "products", "ig-content");
  const productPipelinesDir = join(productDir, "pipelines");
  mkdirSync(stepsDir, { recursive: true });
  mkdirSync(productPipelinesDir, { recursive: true });

  writeJson(join(corePipelinesDir, "types.json"), {
    schemaVersion: 1,
    pipelineTypes: [
      {
        id: "profile-building",
        description: "Build profiles.",
        artifactTypes: ["identity-profile"],
      },
      {
        id: "contact-sheet",
        description: "Build contact sheets.",
        artifactTypes: ["contact-sheet"],
      },
      {
        id: "enhancement",
        description: "Enhance artifacts.",
        artifactTypes: ["enhanced-variation"],
      },
      {
        id: "evaluation",
        description: "Evaluate routes.",
        artifactTypes: ["evaluation-report"],
      },
    ],
  });

  writeJson(join(stepsDir, "generate-anchor.json"), {
    schemaVersion: 1,
    id: "generate-anchor",
    pipelineTypes: ["contact-sheet", "evaluation"],
    description: "Generate an anchor image.",
    inputs: ["intention"],
    outputs: ["variation"],
    providerRouteRequired: true,
    approvalRequiredForRealIdentityData: true,
  });
  writeJson(join(stepsDir, "evaluate-provider-route.json"), {
    schemaVersion: 1,
    id: "evaluate-provider-route",
    pipelineTypes: ["evaluation"],
    description: "Evaluate a provider route.",
    inputs: ["provider-route-output"],
    outputs: ["evaluation-score"],
    providerRouteRequired: false,
    approvalRequiredForRealIdentityData: false,
  });

  writeJson(join(productPipelinesDir, "contact-sheet.json"), {
    schemaVersion: 1,
    id: "ig-content.contact-sheet",
    pipelineType: "contact-sheet",
    description: "Contact Sheet pipeline.",
    enabled: true,
    steps: [
      {
        stepId: "generate-anchor",
        providerRoute: "cloudflare-ai-gateway:openai/gpt-image-2",
      },
    ],
  });
  writeJson(join(productPipelinesDir, "evaluation.json"), {
    schemaVersion: 1,
    id: "ig-content.evaluation",
    pipelineType: "evaluation",
    description: "Evaluation pipeline.",
    enabled: true,
    candidateProviderRoutes: [
      "cloudflare-ai-gateway:openai/gpt-image-2",
      "krea:krea-1",
    ],
    steps: [
      { stepId: "generate-anchor" },
      { stepId: "evaluate-provider-route" },
    ],
    promotionPolicy: { automaticPromotion: false, requiresApproval: true },
  });

  return root;
}

function runTool(args, root) {
  return spawnSync(process.execPath, [toolPath, ...args, "--root", root], {
    encoding: "utf8",
  });
}

describe("pipeline workspace validator", () => {
  it("accepts shared steps and product pipeline configs that match the core taxonomy", () => {
    const root = createWorkspace();

    const result = runTool(["check"], root);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("event=pipeline_workspace_check status=ok");
    expect(result.stdout).toContain("products=ig-content");
  });

  it("blocks product workspaces without file-native pipeline configs", () => {
    const root = createWorkspace();
    const productPipelinesDir = join(
      root,
      "products",
      "second-product",
      "pipelines",
    );
    mkdirSync(join(root, "products", "second-product"), { recursive: true });

    const result = runTool(["check"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MISSING_PRODUCT_PIPELINES_DIR");
    expect(result.stderr).toContain("products/{product}/pipelines");
    expect(productPipelinesDir).toContain("pipelines");
  });

  it("blocks product-private Pipeline Steps", () => {
    const root = createWorkspace();
    const pipelinePath = join(
      root,
      "products",
      "ig-content",
      "pipelines",
      "contact-sheet.json",
    );
    const pipeline = JSON.parse(readFileSync(pipelinePath, "utf8"));
    pipeline.steps.push({ stepId: "custom-product-private-step" });
    writeJson(pipelinePath, pipeline);

    const result = runTool(["check"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("UNKNOWN_PRODUCT_PIPELINE_STEP");
    expect(result.stderr).toContain("widen the core catalog first");
  });

  it("requires Provider Routes for non-evaluation configs when the shared step needs one", () => {
    const root = createWorkspace();
    const pipelinePath = join(
      root,
      "products",
      "ig-content",
      "pipelines",
      "contact-sheet.json",
    );
    const pipeline = JSON.parse(readFileSync(pipelinePath, "utf8"));
    delete pipeline.steps[0].providerRoute;
    writeJson(pipelinePath, pipeline);

    const result = runTool(["check"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MISSING_STRING_FIELD");
    expect(result.stderr).toContain("steps[0].providerRoute");
  });

  it("writes SARIF diagnostics for qlty when pipeline checks fail", () => {
    const root = createWorkspace();
    const outputPath = join(root, "pipeline-workspace.sarif");
    const pipelinePath = join(
      root,
      "products",
      "ig-content",
      "pipelines",
      "evaluation.json",
    );
    const pipeline = JSON.parse(readFileSync(pipelinePath, "utf8"));
    pipeline.promotionPolicy.automaticPromotion = true;
    writeJson(pipelinePath, pipeline);

    const result = runTool(["check", "--sarif", "--output", outputPath], root);
    const sarif = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.status).toBe(1);
    expect(sarif.runs[0].results[0].ruleId).toBe(
      "INVALID_EVALUATION_PROMOTION_POLICY",
    );
    expect(sarif.runs[0].results[0].message.text).toContain(
      "event=pipeline_workspace_validation",
    );
  });
});
