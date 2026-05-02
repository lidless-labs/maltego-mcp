import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  {
    graphId: Type.String(),
    from: Type.String({ description: "Source entityId." }),
    to: Type.String({ description: "Target entityId." }),
    label: Type.Optional(Type.String()),
    properties: Type.Optional(Type.Record(Type.String(), Type.String())),
  },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  graphId: z.string(),
  from: z.string().describe("Source entityId."),
  to: z.string().describe("Target entityId."),
  label: z.string().optional(),
  properties: z.record(z.string(), z.string()).optional(),
};

export interface ToolDeps {
  registry: GraphRegistry;
  config: MaltegoConfig;
}

export function createAddLinkTool(deps: ToolDeps) {
  return {
    name: "maltego_add_link",
    label: "maltego: add link",
    description: "Add a directed link between two entities. Returns linkId.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const g = deps.registry.getOrThrow(input.graphId);
      const link = g.addLink({
        from: input.from,
        to: input.to,
        label: input.label,
        properties: input.properties ?? {},
      });
      return jsonToolResult({ linkId: link.id, from: link.from, to: link.to });
    },
  };
}
