import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "index": "index.ts",
    "cli": "cli.ts",
    "mcp-bin": "mcp-bin.ts",
    "mcp-server": "mcp-server.ts",
    "demo-basic": "scripts/demo-basic.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  shims: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  external: ["openclaw"],
});
