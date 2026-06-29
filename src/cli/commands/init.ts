/**
 * brain init — create .brain/ directory with version.json and auth token.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { defaultConfig } from "../../config/config.ts";

export async function initCommand(rootPath: string): Promise<void> {
  const config = defaultConfig(rootPath);
  const brainDir = config.brainDir;

  // Create .brain/ directory
  fs.mkdirSync(brainDir, { recursive: true });

  // Write version.json
  const versionPath = path.join(brainDir, "version.json");
  const versionData = { format: 1, schema: 0 };
  fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2), "utf-8");

  // Generate auth token
  const tokenPath = path.join(brainDir, "token");
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(tokenPath, token, "utf-8");
  fs.chmodSync(tokenPath, 0o600);

  console.error(`Brain initialized at ${brainDir}`);
  console.error(`Token written to ${tokenPath}`);
}