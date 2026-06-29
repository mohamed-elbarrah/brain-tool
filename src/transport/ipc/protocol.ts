/**
 * IPC Protocol — JSON-RPC 2.0 method definitions, types, and framing.
 *
 * [HARD] §4.1: JSON-RPC 2.0 over length-prefixed framing.
 * [HARD] §4.5: Reserved cancel/progress method names (returns NotImplemented).
 * [HARD] §4.4: Capability negotiation with 4 independent versions.
 *
 * Length-prefixed framing: 4 bytes (uint32 big-endian) = payload length,
 * followed by that many bytes of UTF-8 JSON.
 */

// ---- JSON-RPC 2.0 types ----

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

// ---- Standard JSON-RPC error codes ----

export const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Reserved for Brain-specific errors (e.g. LimitExceeded). */
  BRAIN_ERROR: -32000,
  /** Reserved for future cancellation. */
  NOT_IMPLEMENTED: -32001,
} as const;

// ---- IPC method names ----

export const METHODS = {
  CAPABILITIES: "capabilities",
  FIND_SYMBOL: "findSymbol",
  FIND_USAGE: "findUsage",
  FIND_DEPENDENTS: "findDependents",
  IMPACT_ANALYSIS: "impactAnalysis",
  FIND_DUPLICATE: "findDuplicate",
  SEARCH_COMPONENTS: "searchComponents",
  SEARCH_ROUTES: "searchRoutes",
  /** Reserved for future cancellation (§4.5). */
  CANCEL: "cancel",
} as const;

// ---- Capabilities (§4.4) ----

export interface Capabilities {
  readonly tools: readonly string[];
  readonly features: {
    readonly semanticSearch: boolean;
    readonly knowledgeLayer: boolean;
    readonly transitiveDepth: number;
  };
  readonly versions: {
    readonly format: number;
    readonly schema: number;
    readonly ipcProtocol: number;
    readonly mcpTools: number;
  };
}

export const CURRENT_CAPABILITIES: Capabilities = {
  tools: [
    "findSymbol",
    "findUsage",
    "findDependents",
    "impactAnalysis",
    "findDuplicate",
    "searchComponents",
    "searchRoutes",
  ],
  features: {
    semanticSearch: false,
    knowledgeLayer: false,
    transitiveDepth: 5,
  },
  versions: {
    format: 1,
    schema: 1,
    ipcProtocol: 1,
    mcpTools: 1,
  },
};

// ---- Framing helpers ----

/** Encode a JSON-RPC message as a length-prefixed buffer. */
export function encodeFrame(message: unknown): Buffer {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/** Decode a length-prefixed frame from a buffer. Returns [message, remaining]. */
export function decodeFrame(
  buffer: Buffer,
): { message: unknown; remaining: Buffer } | null {
  if (buffer.length < 4) return null;
  const length = buffer.readUInt32BE(0);
  if (buffer.length < 4 + length) return null;
  const json = buffer.subarray(4, 4 + length).toString("utf-8");
  const message = JSON.parse(json);
  const remaining = buffer.subarray(4 + length);
  return { message, remaining };
}

// ---- Error helpers ----

export function makeErrorResponse(
  id: number | string,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export function makeSuccessResponse(
  id: number | string,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function makeNotification(method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 0, method, params };
}