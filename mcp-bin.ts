#!/usr/bin/env node
import { serve } from "./mcp-server.js";

serve().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`maltego-mcp fatal: ${msg}`);
  process.exit(1);
});
