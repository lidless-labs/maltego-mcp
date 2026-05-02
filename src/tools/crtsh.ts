import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { crtshLookup } from "../lookups/crtsh.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  { domain: Type.String() },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = { domain: z.string() };

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createCrtshTool(deps: ToolDeps) {
  return {
    name: "maltego_crtsh",
    label: "maltego: crt.sh",
    description: "Certificate Transparency search via crt.sh. Honors lookupTimeoutMs.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      return jsonToolResult(await crtshLookup(input.domain, deps.config.lookupTimeoutMs));
    },
  };
}
