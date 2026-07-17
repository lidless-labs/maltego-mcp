import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { confineToOutputDir } from "../../../src/server/paths.js";

describe("confineToOutputDir", () => {
  let root: string;
  let outputDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maltego-paths-"));
    outputDir = join(root, "output");
    outsideDir = join(root, "outside");
    await mkdir(outputDir);
    await mkdir(outsideDir);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("allows a not-yet-created path beneath outputDir", () => {
    expect(confineToOutputDir("nested/graph.mtgx", outputDir)).toBe(
      resolve(outputDir, "nested/graph.mtgx"),
    );
  });

  it("rejects a path whose existing symlink ancestor escapes outputDir", async () => {
    const link = join(outputDir, "link");
    await symlink(outsideDir, link, process.platform === "win32" ? "junction" : "dir");

    expect(() => confineToOutputDir("link/escape.mtgx", outputDir)).toThrow(
      /outside the configured output directory/,
    );
  });
});
