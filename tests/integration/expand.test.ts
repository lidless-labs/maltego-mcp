import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { createExpandDomainTool } from "../../src/tools/index.js";
import { dnsLookup } from "../../src/lookups/dns.js";

vi.mock("../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", raw: "", registrar: "BadCorp", nameservers: ["NS1.BAD"] }
  })
}));
vi.mock("../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", a: ["9.9.9.9"], aaaa: [], mx: [], ns: [], txt: [] }
  })
}));
vi.mock("../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "9.9.9.9", asn: 64512, prefix: "9.9.9.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "EVIL" }
  })
}));

describe("integration: expand_domain writes a real .mtgx", () => {
  let reg: GraphRegistry;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-expand-int-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("produces a non-empty .mtgx containing the domain and its resolved IP", async () => {
    const config = { outputDir: tmp, lookupTimeoutMs: 30000 };
    const expandDomainTool = createExpandDomainTool({ registry: reg, config });
    const out = join(tmp, "evil.mtgx");
    const result = await expandDomainTool.execute("test", { domain: "evil.example", outputPath: out });
    const resultData = (result as any).details;
    const fstat = await stat(resultData.path);
    expect(fstat.size).toBeGreaterThan(100);
    const g = reg.getOrThrow(resultData.graphId);
    const values = g.allEntities().map((e) => e.value);
    expect(values).toContain("evil.example");
    expect(values).toContain("9.9.9.9");
  });

  it("handles multiple A records in the same ASN without duplicate errors", async () => {
    vi.mocked(dnsLookup).mockResolvedValueOnce({
      ok: true,
      data: { domain: "multi.example", a: ["9.9.9.9", "9.9.9.10"], aaaa: [], mx: [], ns: [], txt: [] }
    });
    const config = { outputDir: tmp, lookupTimeoutMs: 30000 };
    const expandDomainTool = createExpandDomainTool({ registry: reg, config });
    const out = join(tmp, "multi.mtgx");
    const result = await expandDomainTool.execute("test", { domain: "multi.example", outputPath: out });
    const resultData = (result as any).details;
    const fstat = await stat(resultData.path);
    expect(fstat.size).toBeGreaterThan(100);
    const g = reg.getOrThrow(resultData.graphId);
    // domain + registrar Phrase + 1 nameserver + 2 IPs + 1 shared AS = 6 entities at minimum
    expect(g.entityCount()).toBeGreaterThanOrEqual(5);
    // verify only one AS entity exists despite two A records sharing the ASN
    const asEntities = g.allEntities().filter((e) => e.type === "maltego.AS");
    expect(asEntities).toHaveLength(1);
  });
});
