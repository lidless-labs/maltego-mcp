import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { dnsLookup } from "../lookups/dns.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  { domain: Type.String() },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = { domain: z.string() };

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createDnsTool(_deps: ToolDeps) {
  return {
    name: "maltego_dns",
    label: "maltego: dns",
    description: "Run a DNS lookup (A / AAAA / MX / NS / TXT) for a domain.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      return jsonToolResult(await dnsLookup(input.domain));
    },
  };
}
