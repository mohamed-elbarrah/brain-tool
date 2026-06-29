/**
 * FileIndex — the serializable per-file extraction result.
 *
 * [HARD] §7.2: Produced by the extractor, consumed by StoragePort.upsertFile.
 * Pure data; no DB access during extraction.
 */

import type { Component } from "./component.ts";
import type { Edge } from "./edge.ts";
import type { LanguageTag, ParseState } from "./identity.ts";
import type { Reference } from "./reference.ts";
import type { Route } from "./route.ts";
import type { Symbol, SymbolMember } from "./symbol.ts";

export interface FileIndex {
  readonly relativePath: string;
  readonly language: LanguageTag;
  readonly mtime: number;
  readonly hash: string;
  readonly parseState: ParseState;
  readonly error: string | undefined;
  readonly symbols: readonly Symbol[];
  readonly members: readonly SymbolMember[];
  readonly references: readonly Reference[];
  readonly edges: readonly Edge[];
  readonly components: readonly Component[];
  readonly routes: readonly Route[];
}
