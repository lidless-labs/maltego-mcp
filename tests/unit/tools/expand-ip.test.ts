import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "1.2.3.4", asn: 64512, prefix: "1.2.3.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "ACME" },
  }),
}));

import { createExpandIpTool } from "../../../src/tools/expand-ip.js";
import { asnLookup } from "../../../src/lookups/asn.js";

describe("expand-ip tool", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("builds and saves a graph from an IP", async () => {
    const tool = createExpandIpTool({
      registry: new GraphRegistry(),
      config: resolveConfig({ pluginConfig: { outputDir: tmp, lookupTimeoutMs: 7777 } }),
    });
    const res = await tool.execute("t", { ip: "1.2.3.4", outputPath: join(tmp, "ip.mtgx") });
    expect(res.details.entityCount).toBeGreaterThanOrEqual(1);
    expect(res.details.path).toBe(join(tmp, "ip.mtgx"));
    expect(vi.mocked(asnLookup)).toHaveBeenCalledWith("1.2.3.4", 7777);
  });
});
