#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { serve } from "./src/server/stdio.js";

export { serve };

// Keep direct execution compatible, but reusable entrypoints must import the
// side-effect-free implementation rather than bundling this auto-start guard.
// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing so the
// server still auto-starts when launched directly as `dist/mcp-server.js`.
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (typeof arg !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  serve().catch((err) => {
    console.error("fatal:", err);
    process.exit(1);
  });
}
