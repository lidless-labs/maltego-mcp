import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { createSaveGraphTool } from "../../../src/tools/save-graph.js";
import { createLoadGraphTool } from "../../../src/tools/load-graph.js";
import { resolveConfig } from "../../../src/config.js";

describe("load-graph tool", () => {
  let registry: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    registry = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-"));
  });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("round-trips a saved graph", async () => {
    const cfg = resolveConfig({ pluginConfig: { outputDir: tmp } });
    const save = createSaveGraphTool({ registry, config: cfg });
    const load = createLoadGraphTool({ registry, config: cfg });

    const g = registry.create("rt");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    g.addLink({ from: a.id, to: b.id, label: "r", properties: {} });
    const path = join(tmp, "rt.mtgx");
    await save.execute("t", { graphId: g.id, path });

    const loaded = await load.execute("t", { path });
    expect(loaded.details.graphId).not.toBe(g.id);
    expect(loaded.details.entityCount).toBe(2);
    expect(loaded.details.linkCount).toBe(1);
  });
});
