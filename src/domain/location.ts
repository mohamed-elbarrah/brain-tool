/**
 * Location — a position or range in a source file.
 *
 * Line and column are 1-indexed. Offsets are 0-indexed byte offsets from
 * the start of the file. Either line/col or offsets (or both) may be present.
 */

export interface Location {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number | undefined;
  readonly endColumn: number | undefined;
  readonly startOffset: number | undefined;
  readonly endOffset: number | undefined;
}

/** Helper to build a Location from its parts. */
export function makeLocation(
  startLine: number,
  startColumn: number,
  endLine: number | undefined,
  endColumn: number | undefined,
  startOffset?: number,
  endOffset?: number,
): Location {
  return { startLine, startColumn, endLine, endColumn, startOffset: startOffset ?? undefined, endOffset: endOffset ?? undefined };
}