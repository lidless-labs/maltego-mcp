#!/usr/bin/env node
import { resolve } from "node:path";
import { buildBasicSocDemoGraph } from "../src/demo/basic-soc-graph.js";
import { writeMtgxFile } from "../src/graph/writer.js";

function parseOutputPath(argv: string[]): string {
  const outputFlag = argv.findIndex((arg) => arg === "--output" || arg === "-o");
  if (outputFlag >= 0) {
    const value = argv[outputFlag + 1];
    if (!value || value.startsWith("-")) {
      throw new Error("missing value for --output");
    }
    return resolve(value);
  }

  const positional = argv.find((arg) => !arg.startsWith("-"));
  return resolve(positional ?? "dist/maltego-mcp-basic-soc-demo.mtgx");
}

async function main(): Promise<void> {
  const outPath = parseOutputPath(process.argv.slice(2));
  const graph = buildBasicSocDemoGraph();
  await writeMtgxFile(graph, outPath);
  console.log(JSON.stringify({
    path: outPath,
    entityCount: graph.entityCount(),
    linkCount: graph.linkCount(),
  }, null, 2));
}

main().catch((err) => {
  console.error(`demo:basic failed: ${(err as Error).message}`);
  process.exit(1);
});
