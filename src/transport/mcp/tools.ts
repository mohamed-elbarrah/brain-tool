/**
 * MCP Tool handlers — each tool calls the IPC client and returns typed results.
 *
 * [HARD] §2.3: Tool descriptions embed the Agent Contract.
 * [HARD] §4.3: Only stable identities cross the wire.
 */

import type { IpcClient } from "../ipc/client.ts";
import type { z } from "zod";
import {
  FindSymbolInput,
  FindUsageInput,
  FindDependentsInput,
  ImpactAnalysisInput,
  FindDuplicateInput,
  SearchComponentsInput,
  SearchRoutesInput,
} from "./schemas.ts";

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodTypeAny;
  readonly handler: (client: IpcClient, params: any) => Promise<any>;
}

// ---- Tool definitions ----

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "findSymbol",
    description: `Find where a symbol is defined in the codebase.
Returns the file path, line/column location, kind, and signature.
Always call this first before reading any file — Brain knows exactly where things live.
Agent Contract: Do NOT grep or recursively search for symbol definitions. Call this tool.`,
    inputSchema: FindSymbolInput,
    handler: async (client, params) => client.findSymbol(params),
  },
  {
    name: "findUsage",
    description: `Find all usages of a symbol across the codebase.
Returns references (imports, calls, type references) with file paths and locations.
Agent Contract: Do NOT grep for usages. Call this tool.`,
    inputSchema: FindUsageInput,
    handler: async (client, params) => client.findUsage(params),
  },
  {
    name: "findDependents",
    description: `Find all symbols that directly depend on a given symbol.
Returns the dependent symbols and the edges connecting them.
Useful for understanding what imports or calls a module.`,
    inputSchema: FindDependentsInput,
    handler: async (client, params) => client.findDependents(params),
  },
  {
    name: "impactAnalysis",
    description: `Analyze the transitive impact of changing a symbol.
Walks the dependency graph outward to find all symbols that would be affected.
Respects a configurable max depth (default: 5).
Agent Contract: Do NOT manually trace dependencies. Call this tool.`,
    inputSchema: ImpactAnalysisInput,
    handler: async (client, params) => client.impactAnalysis(params),
  },
  {
    name: "findDuplicate",
    description: `Find symbols with the same or similar implementation.
Uses signature hash matching to detect duplicate code.
Pass the signatureHash from a findSymbol result.`,
    inputSchema: FindDuplicateInput,
    handler: async (client, params) => client.findDuplicate(params),
  },
  {
    name: "searchComponents",
    description: `Search indexed React components by name, prop name, or component usage.
Returns component metadata including props and imported component dependencies.`,
    inputSchema: SearchComponentsInput,
    handler: async (client, params) => client.searchComponents(params),
  },
  {
    name: "searchRoutes",
    description: `Search indexed API routes by path pattern, HTTP method, or controller.
Returns route definitions with paths, methods, and controller associations.`,
    inputSchema: SearchRoutesInput,
    handler: async (client, params) => client.searchRoutes(params),
  },
];