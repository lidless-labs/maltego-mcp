#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { resolveConfig } from "./src/config.js";
import { GraphRegistry } from "./src/server/registry.js";
import { ALL_TOOL_FACTORIES, MCP_INPUT_SHAPES } from "./src/tools/index.js";
import { toToolResponse } from "./src/server/errors.js";

const VERSION = "0.3.0";

async function main(): Promise<void> {
  const config = resolveConfig({ env: process.env });
  const registry = new GraphRegistry();
  const deps = { registry, config };

  const server = new McpServer({ name: "maltego-mcp", version: VERSION });

  for (const factory of ALL_TOOL_FACTORIES) {
    const tool = factory(deps);
    const shape = MCP_INPUT_SHAPES[tool.name];
    if (!shape) {
      throw new Error(`maltego-mcp: missing MCP input shape for ${tool.name}`);
    }
    const handler = async (args: unknown): Promise<CallToolResult> => {
      try {
        const res = await tool.execute("mcp", (args ?? {}) as Record<string, unknown>);
        return { content: res.content };
      } catch (err) {
        return toToolResponse(err);
      }
    };
    server.tool(tool.name, tool.description, shape as never, handler as never);
  }

  await server.connect(new StdioServerTransport());
  console.error(`maltego-mcp ${VERSION} ready (output dir: ${config.outputDir})`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
