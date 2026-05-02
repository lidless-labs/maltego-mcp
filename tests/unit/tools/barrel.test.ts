import { describe, it, expect } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";
import { ALL_TOOL_FACTORIES } from "../../../src/tools/index.js";

describe("tool barrel", () => {
  it("exports exactly 12 factories", () => {
    expect(ALL_TOOL_FACTORIES.length).toBe(12);
  });

  it("exposes the expected tool names", () => {
    const deps = { registry: new GraphRegistry(), config: resolveConfig({}) };
    const names = ALL_TOOL_FACTORIES.map((f) => f(deps).name).sort();
    expect(names).toEqual([
      "maltego_add_entity",
      "maltego_add_link",
      "maltego_asn",
      "maltego_create_graph",
      "maltego_crtsh",
      "maltego_dns",
      "maltego_expand_domain",
      "maltego_expand_hash",
      "maltego_expand_ip",
      "maltego_load_graph",
      "maltego_save_graph",
      "maltego_whois",
    ]);
  });

  it("all factory tool names are unique", () => {
    const deps = { registry: new GraphRegistry(), config: resolveConfig({}) };
    const names = ALL_TOOL_FACTORIES.map((f) => f(deps).name);
    expect(new Set(names).size).toBe(names.length);
  });
});
