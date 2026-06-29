/**
 * Project root detection.
 *
 * Walks up from cwd looking for .brain/ directory or package.json.
 * Returns the project root path.
 */

import fs from "node:fs";
import path from "node:path";

/** Find the project root by walking up from startPath. */
export function detectProjectRoot(startPath?: string): string | null {
  let current = startPath ?? process.cwd();
  const root = path.parse(current).root;

  while (true) {
    // Check for .brain/ directory
    if (fs.existsSync(path.join(current, ".brain"))) {
      return current;
    }
    // Check for package.json
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    // Reached filesystem root
    if (current === root) return null;
    current = path.dirname(current);
  }
}