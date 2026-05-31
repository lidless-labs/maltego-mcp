import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildBasicSocDemoGraph } from "../../src/demo/basic-soc-graph.js";
import { writeMtgxFile } from "../../src/graph/writer.js";
import { readMtgxFile } from "../../src/graph/reader.js";

describe("integration: Basic SOC demo graph", () => {
  it("writes a deterministic .mtgx that can be loaded back", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "maltego-basic-demo-"));
    try {
      const outPath = join(tmp, "basic-demo.mtgx");
      const graph = buildBasicSocDemoGraph();

      await writeMtgxFile(graph, outPath);

      const fstat = await stat(outPath);
      expect(fstat.size).toBeGreaterThan(100);

      const restored = await readMtgxFile(outPath, "g-restored");
      expect(restored.entityCount()).toBe(graph.entityCount());
      expect(restored.linkCount()).toBe(graph.linkCount());
      expect(restored.allEntities().map((entity) => entity.value)).toContain("[T1566] Phishing");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
