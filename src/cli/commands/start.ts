/**
 * brain start — launch the daemon.
 */

import { Daemon } from "../../daemon/daemon.ts";
import { defaultConfig } from "../../config/config.ts";
import { detectProjectRoot } from "../../config/detection.ts";

export async function startCommand(rootPath?: string): Promise<void> {
  const projectRoot = rootPath ?? detectProjectRoot();
  if (!projectRoot) {
    console.error("No project root found. Run `brain init` first.");
    process.exit(1);
  }

  const config = defaultConfig(projectRoot);
  const daemon = new Daemon({ config });

  try {
    await daemon.init();
    await daemon.start();
    console.error("Brain daemon started.");

    // Handle shutdown signals
    process.on("SIGINT", async () => {
      console.error("\nShutting down...");
      await daemon.stop();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      console.error("\nShutting down...");
      await daemon.stop();
      process.exit(0);
    });
  } catch (e: any) {
    console.error(`Failed to start daemon: ${e.message}`);
    await daemon.stop();
    process.exit(1);
  }
}