/**
 * Version gate — checks .brain/version.json on startup.
 *
 * [HARD] §6.8: Incompatible format → refuses to start with "run brain rebuild".
 * Schema newer than binary → refuse to start (downgrade not supported).
 */

import fs from "node:fs";
import path from "node:path";

export interface BrainVersion {
  readonly format: number;
  readonly schema: number;
}

const CURRENT_FORMAT = 1;

export class VersionGate {
  private versionPath: string;

  constructor(brainDir: string) {
    this.versionPath = path.join(brainDir, "version.json");
  }

  /** Read the current version. Returns null if no version file exists. */
  read(): BrainVersion | null {
    try {
      const data = fs.readFileSync(this.versionPath, "utf-8");
      return JSON.parse(data) as BrainVersion;
    } catch {
      return null;
    }
  }

  /** Write the current version. */
  write(schemaVersion: number): void {
    const data: BrainVersion = { format: CURRENT_FORMAT, schema: schemaVersion };
    fs.writeFileSync(this.versionPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Check compatibility. Returns:
   *   - "ok" if compatible
   *   - "rebuild" if format is incompatible (needs brain rebuild)
   *   - "downgrade" if schema is newer than binary
   */
  check(schemaVersion: number): "ok" | "rebuild" | "downgrade" {
    const current = this.read();
    if (!current) return "ok"; // Fresh install — will write on first run

    if (current.format !== CURRENT_FORMAT) return "rebuild";
    if (current.schema > schemaVersion) return "downgrade";
    return "ok";
  }
}