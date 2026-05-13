#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// @rust-exception rationale: this gate validates JSON files already owned by the Node product-workspace tool and must run inside the current pnpm/qlty path without adding a second toolchain.

const REQUIRED_PIPELINE_TYPES = [
  "profile-building",
  "contact-sheet",
  "enhancement",
  "evaluation",
];

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? "check";
  let root = process.cwd();
  let productId = null;
  let sarif = false;
  let output = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") {
      root = resolve(args[i + 1]);
      i += 1;
    } else if (arg === "--sarif") {
      sarif = true;
    } else if (arg === "--output") {
      output = resolve(args[i + 1]);
      i += 1;
    } else if (!arg.startsWith("--") && productId === null) {
      productId = arg;
    }
  }

  return { command, root, productId, sarif, output };
}

function pipelineError(
  code,
  path,
  message,
  suggestion = "fix the Generation Pipeline source file and rerun pipeline validation",
) {
  const details = {
    event: "pipeline_workspace_validation",
    code,
    path,
    message,
    suggestion,
  };
  const error = new Error(
    `event=pipeline_workspace_validation code=${code} path=${path} message=${JSON.stringify(message)} suggestion=${JSON.stringify(suggestion)}`,
  );
  error.code = code;
  error.details = details;
  return error;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw pipelineError(
      "INVALID_JSON",
      path,
      error instanceof Error ? error.message : "unknown JSON error",
    );
  }
}

function assertString(value, path, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw pipelineError(
      "MISSING_STRING_FIELD",
      path,
      `${field} must be a non-empty string`,
    );
  }
}

function assertBoolean(value, path, field) {
  if (typeof value !== "boolean") {
    throw pipelineError(
      "MISSING_BOOLEAN_FIELD",
      path,
      `${field} must be a boolean`,
    );
  }
}

function assertStringArray(value, path, field) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw pipelineError(
      "INVALID_STRING_ARRAY",
      path,
      `${field} must be a non-empty array of strings`,
    );
  }
}

function assertSchemaVersion(value, path) {
  if (value !== 1) {
    throw pipelineError(
      "INVALID_SCHEMA_VERSION",
      path,
      "schemaVersion must be 1",
    );
  }
}

function readCoreTypes(root) {
  const path = join(root, "core", "pipelines", "types.json");
  if (!existsSync(path)) {
    throw pipelineError(
      "MISSING_PIPELINE_TYPES",
      path,
      "core Pipeline Type taxonomy is missing",
    );
  }

  const document = readJson(path);
  assertSchemaVersion(document.schemaVersion, path);
  if (!Array.isArray(document.pipelineTypes)) {
    throw pipelineError(
      "INVALID_PIPELINE_TYPES",
      path,
      "pipelineTypes must be an array",
    );
  }

  const typeIds = new Set();
  for (const type of document.pipelineTypes) {
    assertString(type.id, path, "pipelineTypes[].id");
    assertString(
      type.description,
      path,
      `pipelineTypes[${type.id}].description`,
    );
    assertStringArray(
      type.artifactTypes,
      path,
      `pipelineTypes[${type.id}].artifactTypes`,
    );
    if (typeIds.has(type.id)) {
      throw pipelineError(
        "DUPLICATE_PIPELINE_TYPE",
        path,
        `Pipeline Type "${type.id}" is duplicated`,
      );
    }
    typeIds.add(type.id);
  }

  for (const requiredType of REQUIRED_PIPELINE_TYPES) {
    if (!typeIds.has(requiredType)) {
      throw pipelineError(
        "MISSING_CORE_PIPELINE_TYPE",
        path,
        `core Pipeline Type taxonomy must include "${requiredType}"`,
        "add the missing core Pipeline Type or update AGENTS.md and CONTEXT.md with the approved taxonomy change",
      );
    }
  }

  return { path, typeIds };
}

function readCoreSteps(root, typeIds) {
  const stepsDir = join(root, "core", "pipelines", "steps");
  if (!existsSync(stepsDir)) {
    throw pipelineError(
      "MISSING_PIPELINE_STEPS_DIR",
      stepsDir,
      "core Pipeline Step catalog is missing",
    );
  }

  const stepFiles = readdirSync(stepsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  if (stepFiles.length === 0) {
    throw pipelineError(
      "EMPTY_PIPELINE_STEPS_DIR",
      stepsDir,
      "core Pipeline Step catalog must include at least one step",
    );
  }

  const steps = new Map();
  for (const file of stepFiles) {
    const path = join(stepsDir, file);
    const step = readJson(path);
    assertSchemaVersion(step.schemaVersion, path);
    assertString(step.id, path, "id");
    if (`${step.id}.json` !== file) {
      throw pipelineError(
        "PIPELINE_STEP_FILENAME_MISMATCH",
        path,
        `Pipeline Step id "${step.id}" must match filename "${file}"`,
        "rename the file or update the id so agents have one stable step identity",
      );
    }
    assertStringArray(step.pipelineTypes, path, "pipelineTypes");
    assertString(step.description, path, "description");
    assertStringArray(step.inputs, path, "inputs");
    assertStringArray(step.outputs, path, "outputs");
    assertBoolean(step.providerRouteRequired, path, "providerRouteRequired");
    assertBoolean(
      step.approvalRequiredForRealIdentityData,
      path,
      "approvalRequiredForRealIdentityData",
    );
    if (steps.has(step.id)) {
      throw pipelineError(
        "DUPLICATE_PIPELINE_STEP",
        path,
        `Pipeline Step "${step.id}" is duplicated`,
      );
    }
    for (const pipelineType of step.pipelineTypes) {
      if (!typeIds.has(pipelineType)) {
        throw pipelineError(
          "UNKNOWN_STEP_PIPELINE_TYPE",
          path,
          `Pipeline Step "${step.id}" references unknown Pipeline Type "${pipelineType}"`,
        );
      }
    }
    steps.set(step.id, { ...step, path });
  }

  return steps;
}

function readProductPipelineConfigs(root, productId, typeIds, steps) {
  const productsRoot = join(root, "products");
  if (!existsSync(productsRoot)) {
    throw pipelineError(
      "MISSING_PRODUCTS_DIR",
      productsRoot,
      "products directory is required",
    );
  }

  const productDirs = readdirSync(productsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && (!productId || entry.name === productId),
    )
    .map((entry) => join(productsRoot, entry.name))
    .sort();
  if (productDirs.length === 0) {
    throw pipelineError(
      "PRODUCT_NOT_FOUND",
      productsRoot,
      `no product workspace matched "${productId ?? "*"}"`,
    );
  }

  const checkedProducts = [];
  for (const productDir of productDirs) {
    const product = basename(productDir);
    const pipelinesDir = join(productDir, "pipelines");
    if (!existsSync(pipelinesDir)) {
      throw pipelineError(
        "MISSING_PRODUCT_PIPELINES_DIR",
        pipelinesDir,
        "Product Workspace must include pipelines/",
        "add products/{product}/pipelines/*.json so Generation Pipeline selection is file-native",
      );
    }

    const pipelineFiles = readdirSync(pipelinesDir)
      .filter((file) => file.endsWith(".json"))
      .sort();
    if (pipelineFiles.length === 0) {
      throw pipelineError(
        "EMPTY_PRODUCT_PIPELINES_DIR",
        pipelinesDir,
        "Product Workspace pipelines/ must include at least one pipeline config",
      );
    }

    for (const file of pipelineFiles) {
      validateProductPipelineConfig(
        product,
        join(pipelinesDir, file),
        readJson(join(pipelinesDir, file)),
        typeIds,
        steps,
      );
    }
    checkedProducts.push(product);
  }

  return checkedProducts;
}

function validateProductPipelineConfig(product, path, config, typeIds, steps) {
  assertSchemaVersion(config.schemaVersion, path);
  assertString(config.id, path, "id");
  if (!config.id.startsWith(`${product}.`)) {
    throw pipelineError(
      "PRODUCT_PIPELINE_ID_MISMATCH",
      path,
      `pipeline id "${config.id}" must start with "${product}."`,
    );
  }
  assertString(config.pipelineType, path, "pipelineType");
  if (!typeIds.has(config.pipelineType)) {
    throw pipelineError(
      "UNKNOWN_PRODUCT_PIPELINE_TYPE",
      path,
      `pipeline config references unknown Pipeline Type "${config.pipelineType}"`,
    );
  }
  assertString(config.description, path, "description");
  assertBoolean(config.enabled, path, "enabled");
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    throw pipelineError(
      "EMPTY_PRODUCT_PIPELINE_STEPS",
      path,
      "pipeline config must include at least one shared Pipeline Step",
    );
  }
  if (config.pipelineType === "evaluation") {
    assertStringArray(
      config.candidateProviderRoutes,
      path,
      "candidateProviderRoutes",
    );
    if (
      config.promotionPolicy?.automaticPromotion !== false ||
      config.promotionPolicy?.requiresApproval !== true
    ) {
      throw pipelineError(
        "INVALID_EVALUATION_PROMOTION_POLICY",
        path,
        "evaluation pipelines must disable automatic promotion and require approval",
      );
    }
  }

  for (const [index, stepConfig] of config.steps.entries()) {
    assertString(stepConfig.stepId, path, `steps[${index}].stepId`);
    const coreStep = steps.get(stepConfig.stepId);
    if (!coreStep) {
      throw pipelineError(
        "UNKNOWN_PRODUCT_PIPELINE_STEP",
        path,
        `pipeline config references unknown Pipeline Step "${stepConfig.stepId}"`,
        "use a shared Pipeline Step from core/pipelines/steps or widen the core catalog first",
      );
    }
    if (!coreStep.pipelineTypes.includes(config.pipelineType)) {
      throw pipelineError(
        "PIPELINE_STEP_TYPE_MISMATCH",
        path,
        `Pipeline Step "${stepConfig.stepId}" does not support Pipeline Type "${config.pipelineType}"`,
      );
    }
    if (
      coreStep.providerRouteRequired &&
      config.pipelineType !== "evaluation"
    ) {
      assertString(
        stepConfig.providerRoute,
        path,
        `steps[${index}].providerRoute`,
      );
    }
  }
}

function validate(root, productId = null) {
  const { typeIds } = readCoreTypes(root);
  const steps = readCoreSteps(root, typeIds);
  const products = readProductPipelineConfigs(root, productId, typeIds, steps);
  return { products, pipelineTypes: [...typeIds], steps: [...steps.keys()] };
}

function check(root, productId = null) {
  return validate(root, productId);
}

function sarifForError(error) {
  const details =
    error instanceof Error && error.details
      ? error.details
      : {
          code: "PIPELINE_WORKSPACE_CHECK_FAILED",
          path: "core/pipelines",
          message: error instanceof Error ? error.message : String(error),
          suggestion: "inspect pipeline workspace validation output",
        };

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "pipeline-workspace",
            informationUri: "core/pipelines/AGENTS.md",
            rules: [
              {
                id: details.code,
                shortDescription: { text: details.code },
                fullDescription: { text: details.message },
                help: { text: details.suggestion },
              },
            ],
          },
        },
        results: [
          {
            ruleId: details.code,
            level: "error",
            message: {
              text: `event=pipeline_workspace_validation code=${details.code} message=${details.message} suggestion=${details.suggestion}`,
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: details.path },
                  region: { startLine: 1 },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function emptySarif() {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "pipeline-workspace",
            informationUri: "core/pipelines/AGENTS.md",
            rules: [],
          },
        },
        results: [],
      },
    ],
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
  const { command, root, productId, sarif, output } = parseArgs(
    process.argv.slice(2),
  );
  try {
    if (command === "validate" || command === "check") {
      const result =
        command === "validate"
          ? validate(root, productId)
          : check(root, productId);
      if (sarif) writeSarif(output, emptySarif());
      console.log(
        `event=pipeline_workspace_${command} status=ok products=${result.products.join(",")} pipelineTypes=${result.pipelineTypes.length} steps=${result.steps.length}`,
      );
      return;
    }
    throw pipelineError(
      "UNKNOWN_COMMAND",
      command,
      `unknown command "${command}"`,
      "use validate or check",
    );
  } catch (error) {
    if (sarif) writeSarif(output, sarifForError(error));
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) main();

export { check, validate };
