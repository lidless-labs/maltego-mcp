import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import pkg from "../../../package.json" with { type: "json" };

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));

// Record the wire responses too: the SDK otherwise ignores duplicate replies
// after resolving a request, hiding the bundled double-server regression.
class RecordingTransport extends StdioClientTransport {
  messages: JSONRPCMessage[] = [];

  override async start(): Promise<void> {
    const receive = this.onmessage;
    this.onmessage = (message) => {
      this.messages.push(message);
      receive?.(message);
    };
    await super.start();
  }
}

async function assertNativeGraph(path: string, values: Record<string, string>) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file("Graphs/Graph1.graphml")!.async("string");
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml).graphml;
  expect(parsed.key).toEqual(expect.arrayContaining([
    expect.objectContaining({ "@_id": "d4", "@_attr.name": "MaltegoEntity" }),
    expect.objectContaining({ "@_id": "d6", "@_attr.name": "MaltegoLink" }),
  ]));
  expect(xml).not.toContain("y:ShapeNode");

  const nodes = Array.isArray(parsed.graph.node) ? parsed.graph.node : [parsed.graph.node];
  const actual: Record<string, string> = {};
  for (const node of nodes) {
    const data = node.data as Record<string, any>[];
    const entity = data.find((entry) => entry["@_key"] === "d4")!["mtg:MaltegoEntity"];
    const position = data.find((entry) => entry["@_key"] === "d5")!["mtg:EntityRenderer"]["mtg:Position"];
    expect(Number.isFinite(Number(position["@_x"]))).toBe(true);
    expect(Number.isFinite(Number(position["@_y"]))).toBe(true);
    const properties = entity["mtg:Properties"]["mtg:Property"];
    const propertiesArray = Array.isArray(properties) ? properties : [properties];
    for (const property of propertiesArray) actual[property["@_name"]] = String(property["mtg:Value"]);
  }
  expect(actual).toMatchObject(values);
}

describe("built MCP entrypoints", () => {
  let buildDir: string;

  beforeAll(async () => {
    // Build with the production tsup configuration, not Vitest's source
    // transform. Keep bundles under node_modules so external deps resolve.
    buildDir = await mkdtemp(join(root, "node_modules/.maltego-entrypoints-"));
    await exec(process.execPath, [
      join(root, "node_modules/tsup/dist/cli-default.js"), "--out-dir", buildDir,
    ], { cwd: root, timeout: 30_000 });
    await writeFile(join(buildDir, "package.json"), '{"type":"module"}\n');
    if (process.platform !== "win32") {
      await symlink(join(buildDir, "mcp-bin.js"), join(buildDir, "maltego-mcp"));
    }
  }, 30_000);

  afterAll(async () => {
    if (buildDir) await rm(buildDir, { recursive: true, force: true });
  });

  const entrypoints = [
    ["mcp-bin.js", []],
    ["mcp-server.js", []],
    ["cli.js", ["mcp"]],
    ...(process.platform === "win32" ? [] : [["maltego-mcp", []]]),
  ] as [string, string[]][];

  it.each(entrypoints)("%s starts one server and preserves graph state", async (entry, args) => {
    const outputDir = await mkdtemp(join(buildDir, "graphs-"));
    const transport = new RecordingTransport({
      command: process.execPath,
      args: [join(buildDir, entry), ...args],
      env: { MALTEGO_MCP_OUTPUT_DIR: outputDir },
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr!.on("data", (chunk) => { stderr += chunk.toString(); });
    const client = new Client({ name: "entrypoint-regression", version: "1.0.0" });

    async function call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 5_000 });
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].type).toBe("text");
      return JSON.parse(content[0].text);
    }

    try {
      await client.connect(transport, { timeout: 5_000 });
      const { graphId } = await call("maltego_create_graph", { name: "entrypoint regression" });
      const domain = await call("maltego_add_entity", { graphId, type: "Domain", value: "example.com" });
      const ip = await call("maltego_add_entity", { graphId, type: "IPv4Address", value: "203.0.113.10" });
      await call("maltego_add_entity", { graphId, type: "Phrase", value: "example note" });
      await call("maltego_add_link", { graphId, from: domain.entityId, to: ip.entityId, label: "resolves" });
      const saved = await call("maltego_save_graph", { graphId, path: "graph.mtgx" });
      expect(saved).toMatchObject({ entityCount: 3, linkCount: 1 });
      const loaded = await call("maltego_load_graph", { path: "graph.mtgx" });
      expect(loaded).toMatchObject({ entityCount: 3, linkCount: 1 });
      await call("maltego_save_graph", { graphId: loaded.graphId, path: "reloaded.mtgx" });
      await assertNativeGraph(join(outputDir, "graph.mtgx"), {
        fqdn: "example.com", "ipv4-address": "203.0.113.10", text: "example note",
      });

      await call("maltego_build_ioc_graph", {
        ioc: { type: "Domain", value: "example.com" },
        outputPath: "ioc.mtgx", notes: ["example IOC note"],
      });
      await assertNativeGraph(join(outputDir, "ioc.mtgx"), {
        fqdn: "example.com", text: "[Note] example IOC note",
      });
      expect(client.getServerVersion()).toEqual({ name: pkg.name, version: pkg.version });
    } finally {
      await client.close();
    }

    expect(stderr.split("\n").filter((line) => line.includes(" ready (output dir:")))
      .toEqual([`maltego-mcp ${pkg.version} ready (output dir: ${outputDir})`]);
    const responses = transport.messages.filter((message) => "id" in message && !("method" in message));
    expect(responses).toHaveLength(10); // initialize + nine tool calls
    const ids = responses.map((message) => "id" in message ? message.id : undefined);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("importing the server bundle does not start a transport", async () => {
    const script = `const server = await import(${JSON.stringify(pathToFileURL(join(buildDir, "mcp-server.js")).href)}); console.log(typeof server.serve);`;
    const result = await exec(process.execPath, ["--input-type=module", "--eval", script], { timeout: 5_000 });
    expect(result.stdout).toBe("function\n");
    expect(result.stderr).toBe("");
  });

  it.each(["--help", "--version"])("CLI %s does not start a server", async (flag) => {
    const result = await exec(process.execPath, [join(buildDir, "cli.js"), flag], { timeout: 5_000 });
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(flag === "--version" ? pkg.version : "Usage:");
  });
});
