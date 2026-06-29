/**
 * MCP Tool schemas — Zod schemas for all 7 query tool inputs/outputs.
 *
 * [HARD] §4.4: Tool names + Zod schemas are part of the versioned surface.
 * [HARD] §2.3: Agent Contract embedded in tool descriptions.
 */

import { z } from "zod";

// ---- Input schemas ----

export const FindSymbolInput = z.object({
  name: z.string().describe("Symbol name to search for"),
  filePath: z.string().optional().describe("Optional: restrict search to a specific file"),
  kind: z.string().optional().describe("Optional: filter by symbol kind (function, class, component, etc.)"),
});

export const FindUsageInput = z.object({
  symbolId: z.string().describe("Stable symbol identifier (from findSymbol result)"),
});

export const FindDependentsInput = z.object({
  symbolId: z.string().describe("Stable symbol identifier"),
});

export const ImpactAnalysisInput = z.object({
  symbolId: z.string().describe("Stable symbol identifier"),
  maxDepth: z.number().optional().describe("Maximum traversal depth (default: 5)"),
});

export const FindDuplicateInput = z.object({
  signatureHash: z.string().describe("Signature hash (from findSymbol result)"),
  excludeSymbolId: z.string().optional().describe("Optional: exclude a specific symbol from results"),
});

export const SearchComponentsInput = z.object({
  name: z.string().optional().describe("Component name (substring match)"),
  propName: z.string().optional().describe("Prop name (substring match)"),
  usesComponent: z.string().optional().describe("Find components that use a specific component"),
});

export const SearchRoutesInput = z.object({
  pathPattern: z.string().optional().describe("Route path pattern (substring match)"),
  method: z.string().optional().describe("HTTP method (get, post, put, delete, etc.)"),
  controllerSymbolId: z.string().optional().describe("Controller symbol identifier"),
});

// ---- Output schemas ----

export const QueryMetaOutput = z.object({
  trust: z.enum(["exact", "estimated"]),
  confidence: z.number().min(0).max(1),
  freshness: z.object({
    lastIndexed: z.number(),
    indexVersion: z.number(),
  }),
  estimatedCost: z.number().positive(),
});

export const SymbolOutput = z.object({
  symbolId: z.string(),
  relativePath: z.string(),
  name: z.string(),
  kind: z.string(),
  exported: z.boolean(),
  location: z.object({
    startLine: z.number(),
    startColumn: z.number(),
    endLine: z.number().nullable().optional(),
    endColumn: z.number().nullable().optional(),
  }),
  signature: z.string(),
  signatureHash: z.string(),
});

export const ReferenceOutput = z.object({
  relativePath: z.string(),
  kind: z.string(),
  specifier: z.string(),
  targetFileHint: z.string().nullable().optional(),
  targetSymbolId: z.string().nullable().optional(),
  location: z.object({
    startLine: z.number(),
    startColumn: z.number(),
  }),
});

export const EdgeOutput = z.object({
  sourceSymbolId: z.string(),
  kind: z.string(),
  targetSymbolId: z.string().nullable().optional(),
  targetReferenceId: z.number().nullable().optional(),
});

export const ComponentOutput = z.object({
  symbolId: z.string(),
  props: z.record(z.string(), z.unknown()),
  importedComponentSymbolIds: z.array(z.string()),
});

export const RouteOutput = z.object({
  symbolId: z.string().nullable().optional(),
  path: z.string(),
  method: z.string(),
  controllerSymbolId: z.string().nullable().optional(),
});

// ---- Result schemas ----

export const FindSymbolResult = z.object({
  symbols: z.array(SymbolOutput),
  meta: QueryMetaOutput,
});

export const FindUsageResult = z.object({
  references: z.array(ReferenceOutput),
  meta: QueryMetaOutput,
});

export const FindDependentsResult = z.object({
  dependents: z.array(SymbolOutput),
  edges: z.array(EdgeOutput),
  meta: QueryMetaOutput,
});

export const ImpactAnalysisResult = z.object({
  affected: z.array(SymbolOutput),
  edges: z.array(EdgeOutput),
  depth: z.number(),
  meta: QueryMetaOutput,
});

export const FindDuplicateResult = z.object({
  duplicates: z.array(SymbolOutput),
  meta: QueryMetaOutput,
});

export const SearchComponentsResult = z.object({
  components: z.array(ComponentOutput),
  meta: QueryMetaOutput,
});

export const SearchRoutesResult = z.object({
  routes: z.array(RouteOutput),
  meta: QueryMetaOutput,
});