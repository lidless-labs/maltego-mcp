import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "index": "index.ts", "mcp-server": "mcp-server.ts" },
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
