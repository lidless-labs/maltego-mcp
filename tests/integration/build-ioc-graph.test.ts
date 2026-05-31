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
});
