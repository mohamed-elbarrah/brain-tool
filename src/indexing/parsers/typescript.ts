/**
 * TypeScriptParser — MVP concrete parser using the TypeScript compiler API.
 *
 * [HARD] §5.3 / §7.0: only imported inside src/indexing/parsers/.
 * The pipeline reaches parsers only via ParserPort.
 *
 * Handles .ts and .tsx files. Sets `scriptKind` based on the extension so
 * JSX syntax is correctly tokenized in .tsx files.
 */

import ts from "typescript";
import type { ParserPort, FileParse, ParseError, LanguageTag } from "../parser-port.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";

export class TypeScriptParser implements ParserPort {
  readonly language: LanguageTag = "typescript";
  readonly extensions: readonly string[] = [".ts", ".tsx"];

  parse(source: string, filePath: string): Result<FileParse, ParseError> {
    try {
      const scriptKind = filePath.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : filePath.endsWith(".ts")
          ? ts.ScriptKind.TS
          : ts.ScriptKind.External;

      const ast = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true, // setParentNodes
        scriptKind,
      );

      // Check for parse diagnostics — createSourceFile does not throw on
      // invalid syntax; it records errors in parseDiagnostics.
      const diagnostics = (ast as any).parseDiagnostics as readonly ts.Diagnostic[] | undefined;
      if (diagnostics && diagnostics.length > 0) {
        const diag = diagnostics[0]!;
        const msg = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
        const errResult: { message: string; line?: number; column?: number } = { message: msg };
        if (diag.file) {
          const pos = diag.file.getLineAndCharacterOfPosition(diag.start ?? 0);
          errResult.line = pos.line + 1;
          errResult.column = pos.character + 1;
        }
        return err(errResult);
      }

      return ok({ language: this.language, filePath, source, ast });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err({ message: msg });
    }
  }
}