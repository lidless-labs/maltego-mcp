import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { confineToOutputDir } from "../server/paths.js";
import { jsonToolResult, saveGraphFile } from "./_shared.js";

const Schema = Type.Object(
  {
    graphId: Type.String(),
    path: Type.String({ description: "Output path. Resolved relative to outputDir; absolute paths must be inside outputDir." }),
    overwrite: Type.Optional(Type.Boolean({ default: false })),
  },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  graphId: z.string(),
  path: z.string().describe("Output path. Resolved relative to outputDir; absolute paths must be inside outputDir."),
  overwrite: z.boolean().optional(),
};

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createSaveGraphTool(deps: ToolDeps) {
  return {
    name: "maltego_save_graph",
    label: "maltego: save graph",
    description: "Save a graph to a .mtgx file inside the configured outputDir. Refuses to overwrite unless overwrite=true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const g = deps.registry.getOrThrow(input.graphId);
      const resolved = confineToOutputDir(input.path, deps.config.outputDir);
      await saveGraphFile(g, resolved, input.overwrite ?? false);
      return jsonToolResult({ path: resolved, entityCount: g.entityCount(), linkCount: g.linkCount() });
    },
  };
}
