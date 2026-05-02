import { describe, it, expect, vi } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("../../../src/lookups/crtsh.js", () => ({
  crtshLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "a.com", certs: [{ id: 1, commonName: "a.com", issuer: "X", sans: [], notBefore: "", notAfter: "", serialNumber: "", entryTimestamp: "" }] },
  }),
}));

import { createCrtshTool } from "../../../src/tools/crtsh.js";
import { crtshLookup } from "../../../src/lookups/crtsh.js";

describe("crtsh tool", () => {
  it("delegates and forwards configured timeout", async () => {
    const tool = createCrtshTool({
      registry: new GraphRegistry(),
      config: resolveConfig({ pluginConfig: { lookupTimeoutMs: 7777 } }),
    });
    await tool.execute("t", { domain: "a.com" });
    expect(crtshLookup).toHaveBeenCalledWith("a.com", 7777);
  });
});
