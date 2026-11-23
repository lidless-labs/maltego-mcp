import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { createBuildIocGraphTool } from "../../src/tools/build-ioc-graph.js";
import { readMtgxFile } from "../../src/graph/reader.js";

describe("integration: build IOC graph", () => {
  it("writes a composed .mtgx from external MCP enrichment summaries", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "maltego-ioc-graph-"));
    try {
      const registry = new GraphRegistry();
      const tool = createBuildIocGraphTool({
        registry,
        config: { outputDir: tmp, lookupTimeoutMs: 30000 },
      });
      const outPath = join(tmp, "ioc.mtgx");

      const result = await tool.execute("test", {
        ioc: { type: "Hash", value: "d41d8cd98f00b204e9800998ecf8427e", properties: { algorithm: "md5" } },
        outputPath: outPath,
        mispEvents: [{ id: 7, info: "demo event" }],
        cortexReports: [{ analyzer: "HashLookup", verdict: "known" }],
        attackTechniques: [{ id: "T1204", name: "User Execution" }],
      });

      expect(result.details.entityCount).toBe(4);
      expect(result.details.linkCount).toBe(3);
      expect((await stat(outPath)).size).toBeGreaterThan(100);

      const restored = await readMtgxFile(outPath, "g-restored");
      expect(restored.allEntities().map((entity) => entity.value)).toContain("[T1204] User Execution");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("keeps separate graph handles for simultaneous builds", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "maltego-ioc-graph-"));
    try {
      const registry = new GraphRegistry();
      const tool = createBuildIocGraphTool({ registry, config: { outputDir: tmp, lookupTimeoutMs: 30000 } });
      const [first, second] = await Promise.all([
        tool.execute("first", { ioc: { type: "Domain", value: "first.example" }, outputPath: "first.mtgx" }),
        tool.execute("second", { ioc: { type: "Domain", value: "second.example" }, outputPath: "second.mtgx" }),
      ]);

      expect(first.details.graphId).not.toBe(second.details.graphId);
      expect(registry.getOrThrow(first.details.graphId).allEntities()[0].value).toBe("first.example");
      expect(registry.getOrThrow(second.details.graphId).allEntities()[0].value).toBe("second.example");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("keeps the successful graph registered when an exclusive save fails", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "maltego-ioc-graph-"));
    try {
      const registry = new GraphRegistry();
      const tool = createBuildIocGraphTool({ registry, config: { outputDir: tmp, lookupTimeoutMs: 30000 } });
      const outputPath = "ioc.mtgx";
      const saved = await tool.execute("first", { ioc: { type: "Domain", value: "first.example" }, outputPath });
      const graph = registry.getOrThrow(saved.details.graphId);

      await expect(tool.execute("second", { ioc: { type: "Domain", value: "second.example" }, outputPath }))
        .rejects.toMatchObject({ cause: { code: "EEXIST" } });
      expect(registry.allIds()).toEqual([saved.details.graphId]);
      expect(registry.get(saved.details.graphId)).toBe(graph);
      expect((await readMtgxFile(join(tmp, outputPath), "restored")).allEntities()[0].value).toBe("first.example");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("round-trips same-title SOC records by source ID and keeps the first repeated record", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "maltego-ioc-graph-"));
    try {
      const registry = new GraphRegistry();
      const tool = createBuildIocGraphTool({ registry, config: { outputDir: tmp, lookupTimeoutMs: 30000 } });
      const result = await tool.execute("soc", {
        ioc: { type: "Domain", value: "example.invalid" },
        outputPath: "ioc.mtgx",
        maxItemsPerSection: 4,
        mispEvents: [
          { id: 7, title: "Shared title", info: "first record" },
          { id: "7", title: "Renamed", info: "later record" },
          { id: "007", title: "Shared title", properties: { eventId: "conflicting metadata" } },
          { title: "Shared title", info: "untagged first" },
          { title: "Shared title", info: "untagged second" },
          { id: 9, title: "Beyond the limit" },
        ],
        thehiveCases: [
          { id: 7, title: "Shared title", status: "Open" },
          { id: "7", title: "Renamed", status: "Closed" },
          { id: "008", title: "Shared title" },
        ],
      });

      const restored = await readMtgxFile(result.details.path, "restored");
      const misp = restored.allEntities().filter(entity => entity.properties.platform === "MISP");
      const thehive = restored.allEntities().filter(entity => entity.properties.platform === "TheHive");
      expect(misp.map(entity => entity.properties.eventId)).toEqual(["7", "007", undefined, undefined]);
      expect(thehive.map(entity => entity.properties.caseId)).toEqual(["7", "008"]);
      expect(misp[0].properties.info).toBe("first record");
      expect(misp.slice(2).map(entity => entity.properties.info)).toEqual(["untagged first", "untagged second"]);
      expect(thehive[0].properties.status).toBe("Open");
      expect(restored.allEntities().map(entity => entity.value)).toEqual(expect.arrayContaining([
        "[MISP] 2 more results omitted",
        "[TheHive] 1 more result omitted",
      ]));
      expect(restored.entityCount()).toBe(9);
      expect(restored.linkCount()).toBe(8);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
