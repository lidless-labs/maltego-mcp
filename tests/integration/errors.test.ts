import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import {
  createCreateGraphTool,
  createAddEntityTool,
  createAddLinkTool,
  createSaveGraphTool,
  createLoadGraphTool,
} from "../../src/tools/index.js";

describe("integration: error propagation", () => {
  let reg: GraphRegistry;
  let createGraphTool: ReturnType<typeof createCreateGraphTool>;
  let addEntityTool: ReturnType<typeof createAddEntityTool>;
  let saveGraphTool: ReturnType<typeof createSaveGraphTool>;
  let loadGraphTool: ReturnType<typeof createLoadGraphTool>;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-err-int-"));
    const config = { outputDir: tmp, lookupTimeoutMs: 30000 };
    createGraphTool = createCreateGraphTool({ registry: reg, config });
    addEntityTool = createAddEntityTool({ registry: reg, config });
    saveGraphTool = createSaveGraphTool({ registry: reg, config });
    loadGraphTool = createLoadGraphTool({ registry: reg, config });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("refuses to overwrite without flag, succeeds with flag", async () => {
    const createRes = await createGraphTool.execute("test", { name: "x" });
    const graphId = (createRes as any).details.graphId;
    await addEntityTool.execute("test", { graphId, type: "Domain", value: "a.com" });
    const out = join(tmp, "x.mtgx");
    await saveGraphTool.execute("test", { graphId, path: out });
    await expect(saveGraphTool.execute("test", { graphId, path: out })).rejects.toThrow(/exists/);
    await saveGraphTool.execute("test", { graphId, path: out, overwrite: true });
  });

  it("throws parse error on malformed .mtgx", async () => {
    const bad = join(tmp, "bad.mtgx");
    await writeFile(bad, Buffer.from([0x00, 0x01, 0x02]));
    await expect(loadGraphTool.execute("test", { path: bad })).rejects.toThrow(/parse|zip/i);
  });

  it("throws validation error with suggestions on unknown entity type", async () => {
    const createRes = await createGraphTool.execute("test", { name: "y" });
    const graphId = (createRes as any).details.graphId;
    await expect(
      addEntityTool.execute("test", { graphId, type: "IPv4", value: "1.2.3.4" })
    ).rejects.toThrow(/Unknown entity type/);
  });
});
