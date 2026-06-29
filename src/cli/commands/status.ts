/**
 * brain status — daemon health + freshness.
 */

import fs from "node:fs";
import path from "node:path";
import { detectProjectRoot } from "../../config/detection.ts";
import { IpcClient } from "../../transport/ipc/client.ts";

export async function statusCommand(rootPath?: string): Promise<void> {
  const projectRoot = rootPath ?? detectProjectRoot();
  if (!projectRoot) {
    console.error("No project root found.");
    process.exit(1);
  }

  const brainDir = path.join(projectRoot, ".brain");
  const socketPath = path.join(brainDir, "brain.sock");
  const tokenPath = path.join(brainDir, "token");

  let token: string;
  try {
    token = fs.readFileSync(tokenPath, "utf-8").trim();
  } catch {
    token = "dev-token";
  }

  const client = new IpcClient();
  try {
    await client.connect(socketPath, token);
    const caps = await client.capabilities();
    console.log("Brain daemon: running");
    console.log(`  Tools: ${caps.tools.join(", ")}`);
    console.log(`  IPC Protocol: v${caps.versions.ipcProtocol}`);
    console.log(`  Schema: v${caps.versions.schema}`);
    console.log(`  Format: v${caps.versions.format}`);
    console.log(`  Transitive depth: ${caps.features.transitiveDepth}`);
    await client.disconnect();
  } catch {
    console.log("Brain daemon: not running");
  }
}