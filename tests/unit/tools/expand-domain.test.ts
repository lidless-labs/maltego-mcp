import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("../../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({ ok: true, data: { domain: "a.com", raw: "", registrar: "X", nameservers: ["ns1.a.com"] } }),
}));
vi.mock("../../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({ ok: true, data: { domain: "a.com", a: ["1.2.3.4"], aaaa: [], mx: [], ns: [], txt: [] } }),
}));
vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({ ok: true, data: { ip: "1.2.3.4", asn: 64512, prefix: "1.2.3.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "ACME" } }),
}));

import { createExpandDomainTool } from "../../../src/tools/expand-domain.js";

describe("expand-domain tool", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("builds a graph with whois + DNS + ASN", async () => {
    const tool = createExpandDomainTool({
      registry: new GraphRegistry(),
      config: resolveConfig({ pluginConfig: { outputDir: tmp } }),
    });
    const res = await tool.execute("t", { domain: "a.com", outputPath: join(tmp, "d.mtgx") });
    expect(res.details.entityCount).toBeGreaterThan(2);
    expect(res.details.linkCount).toBeGreaterThan(0);
  });
});
