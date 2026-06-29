/**
 * Indexing pipeline — orchestrates parse → extract → reconcile → store.
 *
 * [HARD] §7.1 / §7.2: Full file update is one transaction via upsertFile.
 * Parse errors quarantine the file. Extraction is pure (no DB).
 * Reconciliation reads DB but writes only via upsertFile.
 *
 * The pipeline is instantiated with a ParserRegistry (for language detection),
 * a StoragePort (for persistence), and then called for each file event.
 */

import type { ParserRegistry } from "./parser-registry.ts";
import type { StoragePort } from "../storage/port.ts";
import type { FileIndex } from "../domain/file-index.ts";
import type { Result } from "../domain/result.ts";
import { err, ok } from "../domain/result.ts";
import type { BrainError } from "../domain/errors.ts";
import { brainError } from "../domain/errors.ts";
import { normalizeRelativePath } from "../domain/identity.ts";
import { extractSymbols } from "./extractors/symbols.ts";
import { extractComponents } from "./extractors/components.ts";
import { extractRoutes } from "./extractors/routes.ts";
import { reconcile } from "./reconciler.ts";

export class Pipeline {
  private registry: ParserRegistry;
  private storage: StoragePort;

  constructor(registry: ParserRegistry, storage: StoragePort) {
    this.registry = registry;
    this.storage = storage;
  }

  /**
   * Process a file: parse, extract, reconcile, store.
   *
   * The pipeline:
   *   1. Reads source from disk (via provided source getter).
   *   2. Resolves a parser from the registry by file extension.
   *   3. Parses source → FileParse (AST).
   *   4. Runs all extractors → symbols, references, edges, components, routes.
   *   5. Runs reconciler → resolved references/edges.
   *   6. Calls storage.upsertFile → one transaction.
   *   7. On error → storage.markFileState("quarantined").
   *
   * @param relativePath — file path relative to project root
   * @param source — file contents
   * @returns Result indicating success or quarantine
   */
  async processFile(relativePath: string, source: string): Promise<Result<void, BrainError>> {
    const normalizedPath = normalizeRelativePath(relativePath);

    // 1. Resolve parser
    const parser = this.registry.resolve(normalizedPath);
    if (!parser) {
      return err(brainError("BadInput", `No parser registered for file: ${normalizedPath}`));
    }

    // 2. Parse
    const parseResult = parser.parse(source, normalizedPath);
    if (!parseResult.ok) {
      // Quarantine on parse error
      await this.storage.markFileState(normalizedPath, "quarantined", parseResult.error.message);
      return err(brainError("ParseError", parseResult.error.message));
    }

    const fileParse = parseResult.value;

    // 3. Extract symbols
    const { symbols, members, references: rawRefs, edges: rawEdges } = extractSymbols(fileParse.ast, normalizedPath);

    // 4. Extract components (needs symbols)
    const { components } = extractComponents(fileParse.ast, symbols);

    // 5. Extract routes
    const { routes } = extractRoutes(fileParse.ast, normalizedPath);

    // 6. Reconcile references and edges
    const reconcileResult = await reconcile(
      { references: rawRefs, edges: rawEdges, filePath: normalizedPath },
      this.storage,
    );

    if (!reconcileResult.ok) {
      // Quarantine on reconciliation failure
      await this.storage.markFileState(normalizedPath, "quarantined", "Reconciliation failed");
      return err(brainError("Internal", "Reconciliation failed"));
    }

    const { references, edges } = reconcileResult.value;

    // 7. Build FileIndex
    const index: FileIndex = {
      relativePath: normalizedPath,
      language: fileParse.language,
      mtime: Date.now(), // Caller should provide actual mtime
      hash: "", // Caller should provide actual hash
      parseState: "ok",
      error: undefined,
      symbols,
      members,
      references,
      edges,
      components,
      routes,
    };

    // 8. Store
    const upsertResult = await this.storage.upsertFile(index);
    if (!upsertResult.ok) {
      await this.storage.markFileState(normalizedPath, "quarantined", "upsertFile failed");
      return err(brainError("Internal", "Indexing failed", upsertResult.error));
    }

    return ok(undefined);
  }

  /**
   * Process a file deletion. Calls storage.deleteFile.
   */
  async deleteFile(relativePath: string): Promise<Result<void, BrainError>> {
    const normalizedPath = normalizeRelativePath(relativePath);
    return this.storage.deleteFile(normalizedPath);
  }
}