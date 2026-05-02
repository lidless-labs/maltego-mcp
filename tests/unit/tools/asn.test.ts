import { describe, it, expect, vi } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "1.2.3.4", asn: 64512, prefix: "1.2.3.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "Test" },
  }),
}));

import { createAsnTool } from "../../../src/tools/asn.js";

describe("asn tool", () => {
  it("delegates to asnLookup", async () => {
    const tool = createAsnTool({ registry: new GraphRegistry(), config: resolveConfig({}) });
    const res = await tool.execute("t", { ip: "1.2.3.4" });
    expect(res.details.ok).toBe(true);
    if (res.details.ok) {
      expect(res.details.data.asn).toBe(64512);
    }
  });
});
