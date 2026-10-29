import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { readMtgxFile } from "../../../src/graph/reader.js";
import { createExpandDomainTool } from "../../../src/tools/expand-domain.js";
import { createExpandIpTool } from "../../../src/tools/expand-ip.js";
import { createExpandHashTool } from "../../../src/tools/expand-hash.js";
import { createBuildIocGraphTool } from "../../../src/tools/build-ioc-graph.js";

vi.mock("../../../src/lookups/dns.js", () => ({ dnsLookup: vi.fn(async () => ({ ok: false })) }));
vi.mock("../../../src/lookups/whois.js", () => ({ whoisLookup: vi.fn(async () => ({ ok: false })) }));
vi.mock("../../../src/lookups/asn.js", () => ({ asnLookup: vi.fn(async () => ({ ok: false })) }));

const cases = [
  ["domain", createExpandDomainTool, { domain: "example.com" }, { domain: "replacement.example" }, "replacement.example"],
  ["ip", createExpandIpTool, { ip: "203.0.113.1" }, { ip: "203.0.113.2" }, "203.0.113.2"],
  ["hash", createExpandHashTool, { hash: "deadbeef" }, { hash: "cafebabe" }, "cafebabe"],
  ["IOC", createBuildIocGraphTool, { ioc: { type: "Hash", value: "deadbeef" } }, { ioc: { type: "Hash", value: "cafebabe" } }, "cafebabe"],
] as const;

describe("atomic tool publication", () => {
  it.each(cases)("%s permits one concurrent creator and explicit replacement", async (_name, create, initial, replacement, value) => {
    const tmp = await mkdtemp(join(tmpdir(), "maltego-concurrent-"));
    try {
      const tool = create({ registry: new GraphRegistry(), config: { outputDir: tmp, lookupTimeoutMs: 1000 } });
      const outputPath = join(tmp, "graph.mtgx");
      const results = await Promise.allSettled([
        tool.execute("a", { ...initial, outputPath, overwrite: false }),
        tool.execute("b", { ...initial, outputPath }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
      expect(failure.reason.message).toContain("file already exists, refusing to overwrite (pass overwrite=true)");
      expect(failure.reason.cause?.code).toBe("EEXIST");
      expect(await readdir(tmp)).toEqual(["graph.mtgx"]);
      const before = (await readMtgxFile(outputPath, "before")).allEntities().map(e => e.value);
      await expect(tool.execute("c", { ...replacement, outputPath, overwrite: false })).rejects.toThrow(/file already exists/);
      expect((await readMtgxFile(outputPath, "unchanged")).allEntities().map(e => e.value)).toEqual(before);
      await tool.execute("d", { ...replacement, outputPath, overwrite: true });
      expect((await readMtgxFile(outputPath, "after")).allEntities().map(e => e.value)).toContain(value);
    } finally { await rm(tmp, { recursive: true, force: true }); }
  });
});
