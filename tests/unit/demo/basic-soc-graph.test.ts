import { describe, expect, it } from "vitest";
import { buildBasicSocDemoGraph } from "../../../src/demo/basic-soc-graph.js";

describe("buildBasicSocDemoGraph", () => {
  it("stays small enough for a Basic-friendly first graph", () => {
    const graph = buildBasicSocDemoGraph();

    expect(graph.entityCount()).toBe(11);
    expect(graph.linkCount()).toBe(12);
    expect(graph.entityCount()).toBeLessThanOrEqual(24);
  });

  it("includes the SOC platform pivot entities", () => {
    const graph = buildBasicSocDemoGraph();
    const values = graph.allEntities().map((entity) => entity.value);

    expect(values).toContain("[MISP] Event #1001 - demo phishing cluster");
    expect(values).toContain("[TheHive] Case #42 - demo investigation");
    expect(values).toContain("[Cortex] Analyzer verdict - suspicious");
    expect(values).toContain("[T1566] Phishing");
  });
});
