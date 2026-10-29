import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as filesystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile, symlink, mkdir, rename, stat, readdir, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, dirname } from "node:path";
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
    const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason.cause?.code).toBe("EEXIST");
    expect(failure.reason.message).toContain("file already exists, refusing to overwrite (pass overwrite=true)");
    expect(await readdir(tmp)).toEqual(["race.mtgx"]);
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
    expect(result[0].status).toBe(overwrite ? "fulfilled" : "rejected");
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

  it.each(["darwin", "win32"])("publishes without Linux APIs on %s", async platform => {
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
    const { open: nativeOpen } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    vi.spyOn(filesystem, "open").mockImplementation(async (path, flags, mode) => {
      expect(String(path)).not.toContain("/proc/self/fd");
      if (typeof flags === "number") expect(flags & (constants.O_DIRECTORY | constants.O_NOFOLLOW)).toBe(0);
      return nativeOpen(path, flags, mode);
    });
    try {
      const tool = createSaveGraphTool({ registry, config: { outputDir: tmp, lookupTimeoutMs: 1000 } });
      const g = registry.create("portable");
      g.addEntity({ type: "Domain", value: "example.com", properties: {} });
      const path = join(tmp, "nested", "portable.mtgx");
      await tool.execute("t", { graphId: g.id, path });
      expect((await JSZip.loadAsync(await readFile(path))).file("Graphs/Graph1.graphml")).not.toBeNull();
      await expect(tool.execute("t", { graphId: g.id, path })).rejects.toThrow(/file already exists/);
      await tool.execute("t", { graphId: g.id, path, overwrite: true });
      expect(await readdir(dirname(path))).toEqual(["portable.mtgx"]);
    } finally { Object.defineProperty(process, "platform", descriptor); }
  });

  it.each(["darwin", "win32"])("rejects a parent swapped during serialization on %s", async platform => {
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
    const output = join(tmp, "output");
    const outside = join(tmp, "outside");
    await mkdir(join(output, "nested"), { recursive: true });
    await mkdir(outside);
    const tool = createSaveGraphTool({ registry, config: { outputDir: output, lookupTimeoutMs: 1000 } });
    const generate = JSZip.prototype.generateAsync;
    vi.spyOn(JSZip.prototype, "generateAsync").mockImplementationOnce(async function (this: JSZip, ...args: Parameters<typeof generate>) {
      const bytes = await generate.apply(this, args);
      await rename(join(output, "nested"), join(output, "parked"));
      await symlink(outside, join(output, "nested"));
      return bytes;
    });
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    try {
      await expect(tool.execute("t", { graphId: registry.create("portable-race").id, path: join(output, "nested", "race.mtgx") })).rejects.toThrow(/symlink/);
      expect(await readdir(outside)).toEqual([]);
    } finally { Object.defineProperty(process, "platform", descriptor); }
  });

  it("rejects a substituted staging source and removes private staging", async () => {
    const { open: nativeOpen } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let substituted = false;
    vi.spyOn(filesystem, "open").mockImplementation(async (path, flags, mode) => {
      const handle = await nativeOpen(path, flags, mode);
      if (typeof flags === "number" && (flags & constants.O_CREAT)) {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, "sync").mockImplementationOnce(async () => {
          await sync();
          expect((await stat(dirname(String(path)))).mode & 0o777).toBe(0o700);
          await unlink(path);
          await writeFile(path, "substituted");
          substituted = true;
        });
      }
      return handle;
    });
    const tool = createSaveGraphTool({ registry, config: { outputDir: tmp, lookupTimeoutMs: 1000 } });
    await expect(tool.execute("t", { graphId: registry.create("source").id, path: join(tmp, "graph.mtgx") })).rejects.toThrow(/staging.*changed/);
    expect(substituted).toBe(true);
    expect(await readdir(tmp)).toEqual([]);
  });

});
