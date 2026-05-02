import { describe, it, expect, vi } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("../../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "a.com", raw: "", registrar: "Test, Inc.", nameservers: ["ns1.a.com"] },
  }),
}));

import { createWhoisTool } from "../../../src/tools/whois.js";

describe("whois tool", () => {
  it("delegates to whoisLookup", async () => {
    const tool = createWhoisTool({ registry: new GraphRegistry(), config: resolveConfig({}) });
    const res = await tool.execute("t", { domain: "a.com" });
    expect(res.details).toMatchObject({ ok: true, data: { registrar: "Test, Inc." } });
  });
});
