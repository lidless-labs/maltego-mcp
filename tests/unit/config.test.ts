import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveConfig } from "../../src/config.js";

describe("resolveConfig", () => {
  it("falls back to defaults when nothing provided", () => {
    const cfg = resolveConfig({});
    expect(cfg.outputDir).toBe(join(homedir(), "MaltegoGraphs"));
    expect(cfg.lookupTimeoutMs).toBe(30_000);
  });

  it("reads from env when provided", () => {
    const cfg = resolveConfig({
      env: {
        MALTEGO_MCP_OUTPUT_DIR: "/tmp/mg",
        MALTEGO_MCP_LOOKUP_TIMEOUT_MS: "5000",
      },
    });
    expect(cfg.outputDir).toBe("/tmp/mg");
    expect(cfg.lookupTimeoutMs).toBe(5000);
  });

  it("pluginConfig takes precedence over env", () => {
    const cfg = resolveConfig({
      pluginConfig: { outputDir: "/p", lookupTimeoutMs: 9999 },
      env: { MALTEGO_MCP_OUTPUT_DIR: "/e", MALTEGO_MCP_LOOKUP_TIMEOUT_MS: "1" },
    });
    expect(cfg.outputDir).toBe("/p");
    expect(cfg.lookupTimeoutMs).toBe(9999);
  });

  it("ignores non-positive lookupTimeoutMs from env", () => {
    const cfg = resolveConfig({ env: { MALTEGO_MCP_LOOKUP_TIMEOUT_MS: "-5" } });
    expect(cfg.lookupTimeoutMs).toBe(30_000);
  });
});
