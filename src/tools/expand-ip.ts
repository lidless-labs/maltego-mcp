import { access } from "node:fs/promises";
import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { asnLookup } from "../lookups/asn.js";
import { writeMtgxFile } from "../graph/writer.js";
import { confineToOutputDir } from "../server/paths.js";
import { ToolFileSystemError } from "../server/errors.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  {
    ip: Type.String(),
    outputPath: Type.String(),
    overwrite: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  ip: z.string(),
  outputPath: z.string(),
  overwrite: z.boolean().optional(),
};

async function ensureWritable(path: string, overwrite: boolean): Promise<void> {
  if (overwrite) return;
  try { await access(path); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  throw new ToolFileSystemError(
    `file already exists, refusing to overwrite (pass overwrite=true): ${path}`,
    path,
  );
}

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createExpandIpTool(deps: ToolDeps) {
  return {
    name: "maltego_expand_ip",
    label: "maltego: expand IP",
    description: "Build a .mtgx graph around an IP (ASN + netblock).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const g = deps.registry.create(`expand-ip-${input.ip}`);
      const ipE = g.addEntity({ type: "IPv4Address", value: input.ip, properties: {} });

      const asn = await asnLookup(input.ip, deps.config.lookupTimeoutMs);
      if (asn.ok) {
        const asE = g.ensureEntity({
          type: "AS",
          value: String(asn.data.asn),
          properties: { organization: asn.data.organization ?? "", country: asn.data.country, registry: asn.data.registry },
        });
        g.addLink({ from: ipE.id, to: asE.id, label: `AS (${asn.data.prefix})`, properties: {} });
        if (asn.data.prefix) {
          const nb = g.ensureEntity({ type: "Netblock", value: asn.data.prefix, properties: {} });
          g.addLink({ from: ipE.id, to: nb.id, label: "within", properties: {} });
        }
      }

      const outPath = confineToOutputDir(input.outputPath, deps.config.outputDir);
      await ensureWritable(outPath, input.overwrite ?? false);
      await writeMtgxFile(g, outPath);
      return jsonToolResult({ graphId: g.id, path: outPath, entityCount: g.entityCount(), linkCount: g.linkCount() });
    },
  };
}
