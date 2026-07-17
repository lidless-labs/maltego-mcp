import { describe, it, expect, vi } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("../../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "a.com", a: ["1.2.3.4"], aaaa: [], mx: [], ns: [], txt: [] },
  }),
}));

import { createDnsTool } from "../../../src/tools/dns.js";
import { dnsLookup } from "../../../src/lookups/dns.js";

describe("dns tool", () => {
  it("delegates to dnsLookup", async () => {
    const config = resolveConfig({ pluginConfig: { lookupTimeoutMs: 7777 } });
    const tool = createDnsTool({ registry: new GraphRegistry(), config });
    const res = await tool.execute("t", { domain: "a.com" });
    expect(vi.mocked(dnsLookup)).toHaveBeenCalledWith("a.com", 7777);
    expect(res.details.ok).toBe(true);
    if (res.details.ok) {
      expect(res.details.data.a).toEqual(["1.2.3.4"]);
    }
  });
});
