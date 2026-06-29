/**
 * brain rebuild — wipe index tables and full rescan.
 *
 * [HARD] §7.4: Truncates content tables (preserving schema), runs full scan.
 * Always safe because the indexer is idempotent.
 */

import Database from "better-sqlite3";
import { detectProjectRoot } from "../../config/detection.ts";
import { defaultConfig } from "../../config/config.ts";
import { Daemon } from "../../daemon/daemon.ts";

export async function rebuildCommand(rootPath?: string): Promise<void> {
  const projectRoot = rootPath ?? detectProjectRoot();
  if (!projectRoot) {
    console.error("No project root found.");
    process.exit(1);
  }

  const config = defaultConfig(projectRoot);

  // Truncate content tables (preserve schema_migrations)
  console.error("Truncating index data...");
  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    DELETE FROM symbol_members;
    DELETE FROM references_;
    DELETE FROM edges;
    DELETE FROM components;
    DELETE FROM component_imports;
    DELETE FROM routes;
    DELETE FROM symbols;
    DELETE FROM files;
  `);
  db.close();

  // Start daemon to re-index
  console.error("Re-indexing...");
  const daemon = new Daemon({ config });
  try {
    await daemon.init();
    await daemon.start();
    console.error("Rebuild complete.");
    await daemon.stop();
  } catch (e: any) {
    console.error(`Rebuild failed: ${e.message}`);
    await daemon.stop();
    process.exit(1);
  }
}