import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  {
    graphId: Type.String(),
    type: Type.String({
      description:
        "Entity type, e.g. Domain, IPv4Address, Hash, Phrase. Auto-prefixes with maltego. if needed.",
    }),
    value: Type.String(),
    properties: Type.Optional(Type.Record(Type.String(), Type.String())),
  },
  { additionalProperties: false }
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  graphId: z.string(),
  type: z
    .string()
    .describe(
      "Entity type, e.g. Domain, IPv4Address, Hash, Phrase. Auto-prefixes with maltego. if needed."
    ),
  value: z.string(),
  properties: z.record(z.string(), z.string()).optional(),
};

export interface ToolDeps {
  registry: GraphRegistry;
  config: MaltegoConfig;
}

export function createAddEntityTool(deps: ToolDeps) {
  return {
    name: "maltego_add_entity",
    label: "maltego: add entity",
    description:
      "Add an entity (node) to a graph. Returns entityId for use with maltego_add_link.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const g = deps.registry.getOrThrow(input.graphId);
      const e = g.addEntity({
        type: input.type,
        value: input.value,
        properties: input.properties ?? {},
      });
      return jsonToolResult({
        entityId: e.id,
        type: e.type,
        value: e.value,
      });
    },
  };
}
