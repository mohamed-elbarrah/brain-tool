/**
 * MCP Server — stdio bridge that exposes Brain tools to AI agents.
 *
 * [HARD] §4.2: Stdio MCP bridge. Speaks MCP on stdio, JSON-RPC to daemon.
 * [HARD] §5.3: @modelcontextprotocol/sdk imported only here.
 * [HARD] §4.4: Capabilities tool is always available.
 *
 * The server connects to the daemon via IpcClient, registers all 7 tools,
 * and translates MCP tool calls into IPC requests.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { IpcClient } from "../ipc/client.ts";
import { TOOLS } from "./tools.ts";

export class McpBridge {
  private server: Server;
  private client: IpcClient;

  constructor(client: IpcClient) {
    this.client = client;

    this.server = new Server(
      {
        name: "brain-tool",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  /** Start the stdio server. */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    await this.server.close();
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        // Validate input
        const parsed = tool.inputSchema.parse(args);

        // Call the tool handler
        const result = await tool.handler(this.client, parsed);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }
}