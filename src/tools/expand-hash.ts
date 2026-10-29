import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { confineToOutputDir } from "../server/paths.js";
import { jsonToolResult, saveGraphFile } from "./_shared.js";

const Schema = Type.Object(
  {
    hash: Type.String(),
    algorithm: Type.Optional(Type.Union([
      Type.Literal("md5"), Type.Literal("sha1"), Type.Literal("sha256"), Type.Literal("sha512"),
    ])),
    outputPath: Type.String(),
    overwrite: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  hash: z.string(),
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).optional(),
  outputPath: z.string(),
  overwrite: z.boolean().optional(),
};

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createExpandHashTool(deps: ToolDeps) {
  return {
    name: "maltego_expand_hash",
    label: "maltego: expand hash",
    description: "Build a .mtgx graph with a Hash entity (extend in later versions).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const g = deps.registry.create(`expand-hash-${input.hash.slice(0, 8)}`);
      g.addEntity({
        type: "Hash",
        value: input.hash,
        properties: { algorithm: input.algorithm ?? "unknown" },
      });
      const outPath = confineToOutputDir(input.outputPath, deps.config.outputDir);
      await saveGraphFile(g, outPath, input.overwrite ?? false);
      return jsonToolResult({ graphId: g.id, path: outPath, entityCount: g.entityCount(), linkCount: g.linkCount() });
    },
  };
}
