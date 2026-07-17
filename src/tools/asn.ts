import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { asnLookup } from "../lookups/asn.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  { ip: Type.String() },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = { ip: z.string() };

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createAsnTool(deps: ToolDeps) {
  return {
    name: "maltego_asn",
    label: "maltego: asn",
    description: "Look up ASN, netblock, country, and org for an IP via Team Cymru.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      return jsonToolResult(await asnLookup(input.ip, deps.config.lookupTimeoutMs));
    },
  };
}
