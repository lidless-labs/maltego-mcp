import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { ToolValidationError } from "../server/errors.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  { name: Type.String({ description: "Display name for the graph." }) },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  name: z.string().describe("Display name for the graph."),
};

export interface ToolDeps {
  registry: GraphRegistry;
  config: MaltegoConfig;
}

export function createCreateGraphTool(deps: ToolDeps) {
  return {
    name: "maltego_create_graph",
    label: "maltego: create graph",
    description:
      "Create a new empty Maltego graph in memory. Returns graphId for use with maltego_add_entity / maltego_add_link / maltego_save_graph.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      if (!input.name) throw new ToolValidationError("name is required");
      const g = deps.registry.create(input.name);
      return jsonToolResult({ graphId: g.id, name: g.name });
    },
  };
}
