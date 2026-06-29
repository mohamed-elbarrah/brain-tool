/**
 * Reference — a raw, unresolved mention of a name in a file.
 *
 * [HARD] §6.1: Stored as-is during parsing. Unresolved references are
 * retained (not dropped) so a later import change can resolve them.
 */

import type { Location } from "./location.ts";
import type { ReferenceKind } from "./identity.ts";

export interface Reference {
  readonly relativePath: string;
  readonly kind: ReferenceKind;
  readonly specifier: string;
  readonly targetFileHint: string | undefined;
  readonly targetSymbolId: string | undefined;
  readonly location: Location;
}
