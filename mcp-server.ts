#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { resolveConfig } from "./src/config.js";
import { GraphRegistry } from "./src/server/registry.js";
import { ALL_TOOL_FACTORIES, MCP_INPUT_SHAPES } from "./src/tools/index.js";
import { toToolResponse } from "./src/server/errors.js";

const VERSION = "0.3.0";

/**
 * Start the maltego-mcp stdio server. Extracted from the former top-level
 * `main()` so the CLI (`maltegoctl mcp`) and the `mcp-bin.ts` entrypoint can
 * both reuse it without forking a child process. Behavior is identical to the
 * pre-CLI server: same tools, same draft-07 `$schema` stripping, same stderr
 * ready line.
 */
export async function serve(): Promise<void> {
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

  const transport = new StdioServerTransport();
  // Strip the draft-07 `$schema` the MCP SDK stamps on tool schemas; Anthropic
  // rejects it ("must match JSON Schema draft 2020-12") when the full tool set
  // is sent, e.g. on subagent spawns. Intercept tools/list output here.
  const __send = transport.send.bind(transport);
  (transport as any).send = (message: any) => {
    const tools = message?.result?.tools;
    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (t?.inputSchema) delete t.inputSchema.$schema;
        if (t?.outputSchema) delete t.outputSchema.$schema;
      }
    }
    return __send(message);
  };
  await server.connect(transport);
  console.error(`maltego-mcp ${VERSION} ready (output dir: ${config.outputDir})`);
}

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing so the
// server still auto-starts when launched directly as `dist/mcp-server.js`.
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (typeof arg !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  serve().catch((err) => {
    console.error("fatal:", err);
    process.exit(1);
  });
}
