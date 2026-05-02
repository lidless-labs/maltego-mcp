import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { resolveConfig } from "../../../src/config.js";
import { createExpandHashTool } from "../../../src/tools/expand-hash.js";

describe("expand-hash tool", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("creates a one-entity graph and writes it", async () => {
    const tool = createExpandHashTool({
      registry: new GraphRegistry(),
      config: resolveConfig({ pluginConfig: { outputDir: tmp } }),
    });
    const res = await tool.execute("t", {
      hash: "deadbeef",
      algorithm: "sha256",
      outputPath: join(tmp, "h.mtgx"),
    });
    expect(res.details.entityCount).toBe(1);
    expect(res.details.linkCount).toBe(0);
  });
});
