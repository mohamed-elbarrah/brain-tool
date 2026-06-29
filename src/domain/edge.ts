/**
 * Edge — an explicit relationship between two symbols.
 *
 * [HARD] §6.3: Explicit only. targetSymbolId is nullable pre-resolution.
 */

import type { EdgeKind } from "./identity.ts";

export interface Edge {
  readonly sourceSymbolId: string;
  readonly kind: EdgeKind;
  readonly targetSymbolId: string | undefined;
  readonly targetReferenceId: number | undefined;
}
