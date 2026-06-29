/**
 * IPC Client — MCP-bridge-side connection to the daemon.
 *
 * [HARD] §4.1: Connects to the daemon's Unix socket, sends length-prefixed
 * JSON-RPC requests, receives responses. No MCP SDK here — that's in
 * src/transport/mcp/.
 *
 * Exposes typed methods matching all 7 queries + capabilities.
 * Handles connection errors gracefully (daemon not running → clear error).
 */

import net from "node:net";
import {
  encodeFrame,
  decodeFrame,
  METHODS,
} from "./protocol.ts";
import type { JsonRpcRequest, JsonRpcResponse, Capabilities } from "./protocol.ts";

export class IpcClient {
  private socket: net.Socket | undefined;
  private buffer = Buffer.alloc(0) as Buffer;
  private pending = new Map<number | string, { resolve: (value: JsonRpcResponse) => void; reject: (err: Error) => void }>();
  private nextId = 1;
  private connected = false;

  /** Connect to the daemon's Unix socket. */
  async connect(socketPath: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(socketPath, () => {
        this.connected = true;
        // Authenticate
        this.sendRequest("auth", { token }).then(() => {
          resolve();
        }).catch(reject);
      });

      this.socket.on("data", (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]) as Buffer;
        this.processFrames();
      });

      this.socket.on("error", (err) => {
        this.connected = false;
        // Reject all pending requests
        for (const [, pending] of this.pending) {
          pending.reject(err);
        }
        this.pending.clear();
        reject(err);
      });

      this.socket.on("close", () => {
        this.connected = false;
        // Reject all pending requests
        for (const [, pending] of this.pending) {
          pending.reject(new Error("Connection closed"));
        }
        this.pending.clear();
      });
    });
  }

  /** Disconnect from the daemon. */
  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.end(() => {
          this.connected = false;
          this.socket = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Check if connected. */
  get isConnected(): boolean {
    return this.connected;
  }

  // ---- Typed RPC methods ----

  async capabilities(): Promise<Capabilities> {
    const result = await this.sendRequest(METHODS.CAPABILITIES);
    return result as Capabilities;
  }

  async findSymbol(params: { name: string; filePath?: string; kind?: string }): Promise<unknown> {
    return this.sendRequest(METHODS.FIND_SYMBOL, params);
  }

  async findUsage(params: { symbolId: string }): Promise<unknown> {
    return this.sendRequest(METHODS.FIND_USAGE, params);
  }

  async findDependents(params: { symbolId: string }): Promise<unknown> {
    return this.sendRequest(METHODS.FIND_DEPENDENTS, params);
  }

  async impactAnalysis(params: { symbolId: string; maxDepth?: number }): Promise<unknown> {
    return this.sendRequest(METHODS.IMPACT_ANALYSIS, params);
  }

  async findDuplicate(params: { signatureHash: string; excludeSymbolId?: string }): Promise<unknown> {
    return this.sendRequest(METHODS.FIND_DUPLICATE, params);
  }

  async searchComponents(params: { name?: string; propName?: string; usesComponent?: string }): Promise<unknown> {
    return this.sendRequest(METHODS.SEARCH_COMPONENTS, params);
  }

  async searchRoutes(params: { pathPattern?: string; method?: string; controllerSymbolId?: string }): Promise<unknown> {
    return this.sendRequest(METHODS.SEARCH_ROUTES, params);
  }

  // ---- Internal ----

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected || !this.socket) {
      throw new Error("Not connected to daemon");
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (response) => {
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        },
        reject,
      });

      this.socket!.write(encodeFrame(request));
    });
  }

  private processFrames(): void {
    while (true) {
      const frame = decodeFrame(this.buffer);
      if (!frame) break;
      this.buffer = frame.remaining;

      const response = frame.message as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        pending.resolve(response);
      }
    }
  }
}