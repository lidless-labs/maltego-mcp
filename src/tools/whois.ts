import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { whoisLookup } from "../lookups/whois.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  { domain: Type.String() },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = { domain: z.string() };

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createWhoisTool(_deps: ToolDeps) {
  return {
    name: "maltego_whois",
    label: "maltego: whois",
    description: "Run a whois lookup for a domain. Returns registrar, nameservers, dates.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      return jsonToolResult(await whoisLookup(input.domain));
    },
  };
}
