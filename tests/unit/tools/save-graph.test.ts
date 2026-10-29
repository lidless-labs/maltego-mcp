import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as filesystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile, symlink, mkdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { readMtgxFile } from "../../../src/graph/reader.js";
import { GraphRegistry } from "../../../src/server/registry.js";
import { createSaveGraphTool } from "../../../src/tools/save-graph.js";
import { resolveConfig } from "../../../src/config.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

describe("save-graph tool", () => {
  let registry: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    registry = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-"));
  });
  afterEach(async () => { vi.restoreAllMocks(); await rm(tmp, { recursive: true, force: true }); });

  it("writes a .mtgx and refuses overwrite", async () => {
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: tmp } }) });
    const g = registry.create("s");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const path = join(tmp, "out.mtgx");
    const saved = await tool.execute("t", { graphId: g.id, path });
    expect(saved.details.path).toBe(path);
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBeGreaterThan(0);
    await expect(tool.execute("t", { graphId: g.id, path })).rejects.toThrow(/exists/);
    await tool.execute("t", { graphId: g.id, path, overwrite: true });
  });

  it("refuses paths outside outputDir", async () => {
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: tmp } }) });
    const g = registry.create("escape");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const outside = resolve(tmp, "..", "escapes.mtgx");
    await expect(tool.execute("t", { graphId: g.id, path: outside })).rejects.toThrow(/outside the configured output directory/);
  });
  it("allows exactly one concurrent no-overwrite save", async () => {
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: tmp } }) });
    const g = registry.create("race");
    g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const path = join(tmp, "race.mtgx");
    const results = await Promise.allSettled([
      tool.execute("a", { graphId: g.id, path }),
      tool.execute("b", { graphId: g.id, path }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await readMtgxFile(path, "loaded")).entityCount()).toBe(1);
  });

  it.each([false, true])("does not follow a target symlink inserted during serialization (overwrite=%s)", async overwrite => {
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: join(tmp, "output") } }) });
    await mkdir(join(tmp, "output"));
    const victim = join(tmp, "victim");
    await writeFile(victim, "unchanged");
    const target = join(tmp, "output", "race.mtgx");
    const generate = JSZip.prototype.generateAsync;
    vi.spyOn(JSZip.prototype, "generateAsync").mockImplementationOnce(async function (this: JSZip, ...args: Parameters<typeof generate>) {
      const bytes = await generate.apply(this, args);
      await symlink(victim, target);
      return bytes;
    });
    const result = await Promise.allSettled([tool.execute("t", { graphId: registry.create("race").id, path: target, overwrite })]);
    expect(await readFile(victim, "utf8")).toBe("unchanged");
    if (!overwrite) expect(result[0].status).toBe("rejected");
  });

  it("refuses a parent directory symlink swapped during serialization", async () => {
    const output = join(tmp, "output");
    const outside = join(tmp, "outside");
    await mkdir(join(output, "nested"), { recursive: true });
    await mkdir(outside);
    const target = join(output, "nested", "race.mtgx");
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: output } }) });
    const generate = JSZip.prototype.generateAsync;
    vi.spyOn(JSZip.prototype, "generateAsync").mockImplementationOnce(async function (this: JSZip, ...args: Parameters<typeof generate>) {
      const bytes = await generate.apply(this, args);
      await rename(join(output, "nested"), join(output, "parked"));
      await symlink(outside, join(output, "nested"));
      return bytes;
    });
    await expect(tool.execute("t", { graphId: registry.create("race").id, path: target })).rejects.toThrow();
    await expect(readFile(join(outside, "race.mtgx"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps writes on the opened parent when its path is swapped after open", async () => {
    const output = join(tmp, "output");
    const outside = join(tmp, "outside");
    await mkdir(join(output, "nested"), { recursive: true });
    await mkdir(outside);
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: output } }) });
    const { open: nativeOpen } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let swapped = false;
    vi.spyOn(filesystem, "open").mockImplementation(async (path, flags, mode) => {
      const handle = await nativeOpen(path, flags, mode);
      if (!swapped && String(path).endsWith("/nested")) {
        swapped = true;
        await rename(join(output, "nested"), join(output, "parked"));
        await symlink(outside, join(output, "nested"));
      }
      return handle;
    });
    await tool.execute("t", { graphId: registry.create("race").id, path: join(output, "nested", "race.mtgx") });
    expect(swapped).toBe(true);
    expect((await readMtgxFile(join(output, "parked", "race.mtgx"), "loaded")).entityCount()).toBe(0);
    await expect(readFile(join(outside, "race.mtgx"))).rejects.toMatchObject({ code: "ENOENT" });
  });

});
