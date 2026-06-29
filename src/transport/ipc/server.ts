/**
 * IPC Server — daemon-side Unix socket listener.
 *
 * [HARD] §4.1: Local Unix domain socket, JSON-RPC 2.0 over length-prefixed
 * framing. One socket, no batching, no multiplexing (MVP).
 * [HARD] §4.3: Only Query Engine requests and responses cross the wire.
 * [HARD] §4.5: cancel(id) returns NotImplemented (reserved).
 *
 * The server reads .brain/token for auth. Every connection must send the
 * token as the first message (a notification with method "auth" and
 * params.token). Unauthenticated connections are rejected.
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import type { QueryEngine } from "../../query/engine.ts";
import {
  encodeFrame,
  decodeFrame,
  makeErrorResponse,
  makeSuccessResponse,
  ERROR_CODES,
  METHODS,
  CURRENT_CAPABILITIES,
} from "./protocol.ts";
import type { JsonRpcRequest, JsonRpcResponse } from "./protocol.ts";

export interface IpcServerOptions {
  /** Directory where brain.sock and token live. */
  brainDir: string;
  /** Auth token. If not provided, reads from .brain/token. */
  token?: string;
}

export class IpcServer {
  private server: net.Server | undefined;
  private engine: QueryEngine;
  private socketPath: string;
  private token: string;

  constructor(engine: QueryEngine, options: IpcServerOptions) {
    this.engine = engine;
    this.socketPath = path.join(options.brainDir, "brain.sock");
    this.token = options.token ?? readToken(options.brainDir);
  }

  /** Start listening. Returns the socket path. */
  async start(): Promise<string> {
    // Remove stale socket if present
    try { fs.unlinkSync(this.socketPath); } catch { /* ignore */ }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let authenticated = false;
        let buffer = Buffer.alloc(0) as Buffer;

        socket.on("data", (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]) as Buffer;

          while (true) {
            const frame = decodeFrame(buffer);
            if (!frame) break;
            buffer = frame.remaining;

            const msg = frame.message as JsonRpcRequest;

            // Auth check
            if (!authenticated) {
              if (msg.method === "auth" && (msg.params as any)?.token === this.token) {
                authenticated = true;
                socket.write(encodeFrame(makeSuccessResponse(msg.id, { ok: true })));
              } else {
                socket.write(encodeFrame(makeErrorResponse(msg.id, ERROR_CODES.INVALID_REQUEST, "Authentication required")));
                socket.destroy();
              }
              continue;
            }

            this.handleMessage(msg).then((response) => {
              // Notifications (no id) don't get a response
              if (msg.id !== undefined) {
                socket.write(encodeFrame(response));
              }
            }).catch((err) => {
              socket.write(encodeFrame(makeErrorResponse(msg.id, ERROR_CODES.INTERNAL_ERROR, err instanceof Error ? err.message : String(err))));
            });
          }
        });

        socket.on("error", () => {
          // Client disconnected — ignore
        });
      });

      this.server.on("error", (err) => reject(err));
      this.server.listen(this.socketPath, () => resolve(this.socketPath));
    });
  }

  /** Stop listening and clean up. */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          try { fs.unlinkSync(this.socketPath); } catch { /* ignore */ }
          this.server = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Handle a single JSON-RPC request. */
  private async handleMessage(
    msg: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    const id = msg.id;

    try {
      switch (msg.method) {
        case METHODS.CAPABILITIES:
          return makeSuccessResponse(id, CURRENT_CAPABILITIES);

        case METHODS.FIND_SYMBOL: {
          const params = msg.params as any;
          const result = await this.engine.findSymbol({
            name: params.name,
            filePath: params.filePath,
            kind: params.kind,
          });
          return toResponse(id, result);
        }

        case METHODS.FIND_USAGE: {
          const params = msg.params as any;
          const result = await this.engine.findUsage({ symbolId: params.symbolId });
          return toResponse(id, result);
        }

        case METHODS.FIND_DEPENDENTS: {
          const params = msg.params as any;
          const result = await this.engine.findDependents({ symbolId: params.symbolId });
          return toResponse(id, result);
        }

        case METHODS.IMPACT_ANALYSIS: {
          const params = msg.params as any;
          const result = await this.engine.impactAnalysis({
            symbolId: params.symbolId,
            maxDepth: params.maxDepth,
          });
          return toResponse(id, result);
        }

        case METHODS.FIND_DUPLICATE: {
          const params = msg.params as any;
          const result = await this.engine.findDuplicate({
            signatureHash: params.signatureHash,
            excludeSymbolId: params.excludeSymbolId,
          });
          return toResponse(id, result);
        }

        case METHODS.SEARCH_COMPONENTS: {
          const params = msg.params as any;
          const result = await this.engine.searchComponents({
            name: params.name,
            propName: params.propName,
            usesComponent: params.usesComponent,
          });
          return toResponse(id, result);
        }

        case METHODS.SEARCH_ROUTES: {
          const params = msg.params as any;
          const result = await this.engine.searchRoutes({
            pathPattern: params.pathPattern,
            method: params.method,
            controllerSymbolId: params.controllerSymbolId,
          });
          return toResponse(id, result);
        }

        case METHODS.CANCEL:
          return makeErrorResponse(id, ERROR_CODES.NOT_IMPLEMENTED, "Cancellation not implemented");

        default:
          return makeErrorResponse(id, ERROR_CODES.METHOD_NOT_FOUND, `Unknown method: ${msg.method}`);
      }
    } catch (e) {
      return makeErrorResponse(id, ERROR_CODES.INTERNAL_ERROR, e instanceof Error ? e.message : String(e));
    }
  }
}

// ---- Helpers ----

function readToken(brainDir: string): string {
  const tokenPath = path.join(brainDir, "token");
  try {
    return fs.readFileSync(tokenPath, "utf-8").trim();
  } catch {
    // Default token for development
    return "dev-token";
  }
}

function toResponse(id: number | string, result: { ok: boolean; value?: unknown; error?: unknown }): JsonRpcResponse {
  if (result.ok) {
    return makeSuccessResponse(id, result.value);
  }
  return makeErrorResponse(id, ERROR_CODES.BRAIN_ERROR, (result.error as any)?.message ?? "Unknown error", result.error);
}