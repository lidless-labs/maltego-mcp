import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { whoisLookup } from "../lookups/whois.js";
import { dnsLookup } from "../lookups/dns.js";
import { asnLookup } from "../lookups/asn.js";
import { confineToOutputDir } from "../server/paths.js";
import { jsonToolResult, saveGraphFile } from "./_shared.js";

const Schema = Type.Object(
  {
    domain: Type.String(),
    outputPath: Type.String(),
    overwrite: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  domain: z.string(),
  outputPath: z.string(),
  overwrite: z.boolean().optional(),
};

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createExpandDomainTool(deps: ToolDeps) {
  return {
    name: "maltego_expand_domain",
    label: "maltego: expand domain",
    description: "Build a .mtgx graph around a domain (whois + DNS + ASN per A record).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const g = deps.registry.create(`expand-domain-${input.domain}`);
      const dE = g.addEntity({ type: "Domain", value: input.domain, properties: {} });

      const [whois, dns] = await Promise.all([
        whoisLookup(input.domain, deps.config.lookupTimeoutMs),
        dnsLookup(input.domain, deps.config.lookupTimeoutMs),
      ]);

      if (whois.ok) {
        const w = whois.data;
        if (w.registrar) {
          const rE = g.ensureEntity({
            type: "Phrase",
            value: `[registrar] ${w.registrar}`,
            properties: { creationDate: w.creationDate ?? "", expiryDate: w.registryExpiryDate ?? "" },
          });
          g.addLink({ from: dE.id, to: rE.id, label: "registered via", properties: {} });
        }
        for (const ns of w.nameservers) {
          const nsE = g.ensureEntity({ type: "Domain", value: ns.toLowerCase(), properties: { role: "nameserver" } });
          g.addLink({ from: dE.id, to: nsE.id, label: "uses NS", properties: {} });
        }
      }

      if (dns.ok) {
        for (const ip of dns.data.a) {
          const ipE = g.ensureEntity({ type: "IPv4Address", value: ip, properties: {} });
          g.addLink({ from: dE.id, to: ipE.id, label: "A record", properties: {} });
          const asn = await asnLookup(ip, deps.config.lookupTimeoutMs);
          if (asn.ok) {
            const asE = g.ensureEntity({
              type: "AS",
              value: String(asn.data.asn),
              properties: { organization: asn.data.organization ?? "" },
            });
            g.addLink({ from: ipE.id, to: asE.id, label: "AS", properties: {} });
          }
        }
      }

      const outPath = confineToOutputDir(input.outputPath, deps.config.outputDir);
      await saveGraphFile(g, outPath, input.overwrite ?? false);
      return jsonToolResult({ graphId: g.id, path: outPath, entityCount: g.entityCount(), linkCount: g.linkCount() });
    },
  };
}
