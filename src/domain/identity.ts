/**
 * Identity helpers — stable, deterministic, pure (no I/O, no crypto dep).
 *
 * [HARD] §6.2: Stable external identities via documented hash.
 * [HARD] §5.1: Layer 0 has no I/O — pure FNV-1a, no node:crypto.
 */

// --- Language ---

export type LanguageTag = "typescript" | "javascript";

// --- Symbol kinds ---

export type SymbolKind =
  | "function"
  | "class"
  | "component"
  | "hook"
  | "type"
  | "interface"
  | "enum"
  | "const"
  | "route"
  | "var";

// --- Member kinds ---

export type MemberKind = "method" | "property" | "param";

// --- Reference kinds ---

export type ReferenceKind = "import" | "call" | "type" | "jsx" | "reexport";

// --- Edge kinds ---

export type EdgeKind =
  | "calls"
  | "callees-of"
  | "imports"
  | "extends"
  | "implements"
  | "uses-component"
  | "route-handler";

// --- Parse state ---

export type ParseState = "ok" | "error" | "quarantined";

// --- FNV-1a 64-bit hash (pure, no I/O) ---

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/**
 * Compute a 64-bit FNV-1a hash of a UTF-8 string.
 * Returns a zero-padded 16-character hex string (stable, deterministic).
 */
export function fnv1a64(input: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]!);
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

// --- Stable symbol identity ---

/**
 * Build a stable, deterministic symbolId from a symbol's defining context.
 *
 * Format: fnv1a64("relativePath:localName:kind")
 * This is the stable external identity agents reference (§6.2).
 */
export function symbolId(relativePath: string, localName: string, kind: SymbolKind): string {
  return fnv1a64(`${relativePath}:${localName}:${kind}`);
}

/**
 * Build a stable signature hash from a symbol's signature string.
 */
export function signatureHash(signature: string): string {
  return fnv1a64(signature);
}

// --- Path normalization ---

/**
 * Normalize a file path to a stable relative form:
 * - Forward slashes only
 * - No leading "./"
 * - No trailing slash
 * - No double slashes
 */
export function normalizeRelativePath(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/\/+/g, "/");
  normalized = normalized.replace(/\/$/, "");
  return normalized;
}
