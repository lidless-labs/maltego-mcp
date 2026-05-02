import { describe, it, expect, beforeEach } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { createAddEntityTool } from "../../../src/tools/add-entity.js";
import { createAddLinkTool } from "../../../src/tools/add-link.js";
import { resolveConfig } from "../../../src/config.js";

describe("add-link tool", () => {
  let registry: GraphRegistry;
  beforeEach(() => { registry = new GraphRegistry(); });

  it("adds a directed link", async () => {
    const cfg = resolveConfig({});
    const addEntity = createAddEntityTool({ registry, config: cfg });
    const addLink = createAddLinkTool({ registry, config: cfg });
    const g = registry.create("demo");
    const a = await addEntity.execute("t", { graphId: g.id, type: "Domain", value: "a.com" });
    const b = await addEntity.execute("t", { graphId: g.id, type: "IPv4Address", value: "1.2.3.4" });
    const link = await addLink.execute("t", {
      graphId: g.id, from: a.details.entityId, to: b.details.entityId, label: "resolves",
    });
    expect(link.details.linkId).toMatch(/^l-/);
    expect(link.details.from).toBe(a.details.entityId);
  });
});
