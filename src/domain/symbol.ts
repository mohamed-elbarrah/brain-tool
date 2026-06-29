/**
 * Symbol — a named declaration in a source file.
 *
 * [HARD] §6.2: Carries stable external identities (symbolId, signatureHash).
 * Internal rowids are never exposed — only these stable fields cross the wire.
 */

import type { Location } from "./location.ts";
import type { MemberKind, SymbolKind } from "./identity.ts";

export interface Symbol {
  readonly symbolId: string;
  readonly relativePath: string;
  readonly name: string;
  readonly localName: string;
  readonly kind: SymbolKind;
  readonly exported: boolean;
  readonly location: Location;
  readonly signature: string;
  readonly signatureHash: string;
}

export interface SymbolMember {
  readonly symbolId: string;
  readonly kind: MemberKind;
  readonly name: string;
  readonly type: string;
  readonly order: number;
}
