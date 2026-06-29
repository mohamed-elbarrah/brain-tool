/**
 * MCP bridge tests — tool definitions and schema validation.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { TOOLS } from "./tools.ts";
import {
  FindSymbolInput,
  FindUsageInput,
  FindDependentsInput,
  ImpactAnalysisInput,
  FindDuplicateInput,
  SearchComponentsInput,
  SearchRoutesInput,
} from "./schemas.ts";

describe("MCP tools", () => {
  it("all 7 tools are defined", () => {
    assert.strictEqual(TOOLS.length, 7);
    const names = TOOLS.map((t) => t.name);
    assert.ok(names.includes("findSymbol"));
    assert.ok(names.includes("findUsage"));
    assert.ok(names.includes("findDependents"));
    assert.ok(names.includes("impactAnalysis"));
    assert.ok(names.includes("findDuplicate"));
    assert.ok(names.includes("searchComponents"));
    assert.ok(names.includes("searchRoutes"));
  });

  it("each tool has a description", () => {
    for (const tool of TOOLS) {
      assert.ok(tool.description.length > 10, `Tool ${tool.name} has short description`);
    }
  });

  it("each tool has an inputSchema", () => {
    for (const tool of TOOLS) {
      assert.ok(tool.inputSchema, `Tool ${tool.name} missing inputSchema`);
    }
  });

  it("findSymbol input validates correctly", () => {
    const valid = FindSymbolInput.parse({ name: "greet" });
    assert.strictEqual(valid.name, "greet");

    const withOpts = FindSymbolInput.parse({ name: "greet", filePath: "src/greet.ts", kind: "function" });
    assert.strictEqual(withOpts.filePath, "src/greet.ts");

    assert.throws(() => FindSymbolInput.parse({}));
  });

  it("findUsage input requires symbolId", () => {
    const valid = FindUsageInput.parse({ symbolId: "fn_greet" });
    assert.strictEqual(valid.symbolId, "fn_greet");
    assert.throws(() => FindUsageInput.parse({}));
  });

  it("findDependents input requires symbolId", () => {
    const valid = FindDependentsInput.parse({ symbolId: "fn_greet" });
    assert.strictEqual(valid.symbolId, "fn_greet");
  });

  it("impactAnalysis input requires symbolId", () => {
    const valid = ImpactAnalysisInput.parse({ symbolId: "fn_greet" });
    assert.strictEqual(valid.symbolId, "fn_greet");
    const withDepth = ImpactAnalysisInput.parse({ symbolId: "fn_greet", maxDepth: 3 });
    assert.strictEqual(withDepth.maxDepth, 3);
  });

  it("findDuplicate input requires signatureHash", () => {
    const valid = FindDuplicateInput.parse({ signatureHash: "abc123" });
    assert.strictEqual(valid.signatureHash, "abc123");
  });

  it("searchComponents input is fully optional", () => {
    const valid = SearchComponentsInput.parse({});
    assert.strictEqual(Object.keys(valid).length, 0);
  });

  it("searchRoutes input is fully optional", () => {
    const valid = SearchRoutesInput.parse({});
    assert.strictEqual(Object.keys(valid).length, 0);
  });
});