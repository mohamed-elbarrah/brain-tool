/**
 * ParserRegistry — maps LanguageTag → ParserPort.
 *
 * [HARD] §7.0: The pipeline depends on ParserRegistry, never on individual
 * parsers. Adding a new language means registering a new implementation here.
 * The MVP ships exactly one entry: "typescript" → TypeScriptParser.
 */

import type { LanguageTag, ParserPort } from "./parser-port.ts";

export class ParserRegistry {
  private parsers = new Map<LanguageTag, ParserPort>();

  register(parser: ParserPort): void {
    this.parsers.set(parser.language, parser);
  }

  get(language: LanguageTag): ParserPort | undefined {
    return this.parsers.get(language);
  }

  has(language: LanguageTag): boolean {
    return this.parsers.has(language);
  }

  /** Resolve a parser for a given file path by matching extensions. */
  resolve(filePath: string): ParserPort | undefined {
    for (const parser of this.parsers.values()) {
      if (parser.extensions.some((ext) => filePath.endsWith(ext))) {
        return parser;
      }
    }
    return undefined;
  }

  /** Return all registered parsers. */
  all(): readonly ParserPort[] {
    return [...this.parsers.values()];
  }
}