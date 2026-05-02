import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import {
  createCreateGraphTool,
  createAddEntityTool,
  createAddLinkTool,
  createSaveGraphTool,
  createLoadGraphTool,
} from "../../src/tools/index.js";

describe("integration: canonical round-trip", () => {
  let reg: GraphRegistry;
  let createGraphTool: ReturnType<typeof createCreateGraphTool>;
  let addEntityTool: ReturnType<typeof createAddEntityTool>;
  let addLinkTool: ReturnType<typeof createAddLinkTool>;
  let saveGraphTool: ReturnType<typeof createSaveGraphTool>;
  let loadGraphTool: ReturnType<typeof createLoadGraphTool>;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-int-"));
    const config = { outputDir: tmp, lookupTimeoutMs: 30000 };
    createGraphTool = createCreateGraphTool({ registry: reg, config });
    addEntityTool = createAddEntityTool({ registry: reg, config });
    addLinkTool = createAddLinkTool({ registry: reg, config });
    saveGraphTool = createSaveGraphTool({ registry: reg, config });
    loadGraphTool = createLoadGraphTool({ registry: reg, config });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("create -> 5 entities -> 4 links -> save -> load -> shape matches", async () => {
    const createRes = await createGraphTool.execute("test", { name: "round-trip" });
    const graphId = (createRes as any).details.graphId;

    const aRes = await addEntityTool.execute("test", { graphId, type: "Domain", value: "evil.example" });
    const a = (aRes as any).details;
    const bRes = await addEntityTool.execute("test", { graphId, type: "IPv4Address", value: "9.9.9.9" });
    const b = (bRes as any).details;
    const cRes = await addEntityTool.execute("test", { graphId, type: "EmailAddress", value: "root@evil.example" });
    const c = (cRes as any).details;
    const dRes = await addEntityTool.execute("test", { graphId, type: "Hash", value: "d41d8cd98f00b204e9800998ecf8427e", properties: { algorithm: "md5" } });
    const d = (dRes as any).details;
    const eRes = await addEntityTool.execute("test", { graphId, type: "Phrase", value: "[T1566] Phishing" });
    const e = (eRes as any).details;

    await addLinkTool.execute("test", { graphId, from: a.entityId, to: b.entityId, label: "resolves" });
    await addLinkTool.execute("test", { graphId, from: a.entityId, to: c.entityId, label: "hosts" });
    await addLinkTool.execute("test", { graphId, from: c.entityId, to: d.entityId, label: "dropped" });
    await addLinkTool.execute("test", { graphId, from: d.entityId, to: e.entityId, label: "uses technique" });

    const outPath = join(tmp, "rt.mtgx");
    const savedRes = await saveGraphTool.execute("test", { graphId, path: outPath });
    const saved = (savedRes as any).details;
    expect(saved.entityCount).toBe(5);
    expect(saved.linkCount).toBe(4);

    const loadedRes = await loadGraphTool.execute("test", { path: outPath });
    const loaded = (loadedRes as any).details;
    expect(loaded.entityCount).toBe(5);
    expect(loaded.linkCount).toBe(4);

    const loadedGraph = reg.getOrThrow(loaded.graphId);
    const values = loadedGraph.allEntities().map((x) => x.value).sort();
    expect(values).toEqual([
      "9.9.9.9",
      "[T1566] Phishing",
      "d41d8cd98f00b204e9800998ecf8427e",
      "evil.example",
      "root@evil.example"
    ]);
  });
});
