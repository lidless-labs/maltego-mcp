import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "index": "index.ts",
    "mcp-server": "mcp-server.ts",
    "demo-basic": "scripts/demo-basic.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  shims: true,
  sourcemap: false,
  dts: false,
  external: ["openclaw"],
});
