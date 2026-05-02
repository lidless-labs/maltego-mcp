import { describe, it, expect, beforeEach } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { createAddEntityTool } from "../../../src/tools/add-entity.js";
import { resolveConfig } from "../../../src/config.js";

describe("add-entity tool", () => {
  let registry: GraphRegistry;
  beforeEach(() => { registry = new GraphRegistry(); });

  it("adds an entity and returns entityId", async () => {
    const g = registry.create("demo");
    const tool = createAddEntityTool({ registry, config: resolveConfig({}) });
    const res = await tool.execute("t", { graphId: g.id, type: "Domain", value: "a.com" });
    expect(res.details.entityId).toMatch(/^e-/);
    expect(res.details.type).toBe("maltego.Domain");
  });

  it("rejects unknown entity types", async () => {
    const g = registry.create("demo");
    const tool = createAddEntityTool({ registry, config: resolveConfig({}) });
    await expect(
      tool.execute("t", { graphId: g.id, type: "NotARealType", value: "x" }),
    ).rejects.toThrow(/Unknown entity type/);
  });

  it("rejects unknown graphId", async () => {
    const tool = createAddEntityTool({ registry, config: resolveConfig({}) });
    await expect(
      tool.execute("t", { graphId: "g-doesnotexist", type: "Domain", value: "a.com" }),
    ).rejects.toThrow();
  });
});
