/**
 * ParserPort — the pluggable parsing seam.
 *
 * [HARD] §7.0: The pipeline depends on ParserPort, never on a concrete parser.
 * A ParserRegistry maps LanguageTag → ParserPort. Adding Python later is a
 * new implementation + registry entry; the pipeline is unchanged.
 *
 * `FileParse` carries the TS AST in MVP. A parser-agnostic AST seam is
 * deferred (§7.0: "Do not build extractor polymorphism now").
 */

import type ts from "typescript";
import type { Result } from "../domain/result.ts";

/** Supported languages. Extensible — add entries when new parsers land. */
export type LanguageTag = "typescript" | "javascript";

/** Result of parsing a single file. Carries the TS AST (MVP-specific). */
export interface FileParse {
  readonly language: LanguageTag;
  readonly filePath: string;
  readonly source: string;
  readonly ast: ts.SourceFile;
}

/** A parse error with a user-facing message. */
export interface ParseError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/** Every parser implements this interface. */
export interface ParserPort {
  readonly language: LanguageTag;
  readonly extensions: readonly string[];
  parse(source: string, filePath: string): Result<FileParse, ParseError>;
}