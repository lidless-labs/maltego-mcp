import { access, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolveConfig, type MaltegoConfig } from "./src/config.js";
import { confineToOutputDir } from "./src/server/paths.js";
import { ToolFileSystemError, ToolValidationError } from "./src/server/errors.js";
import { whoisLookup } from "./src/lookups/whois.js";
import { dnsLookup } from "./src/lookups/dns.js";
import { asnLookup } from "./src/lookups/asn.js";
import { crtshLookup } from "./src/lookups/crtsh.js";
import { readMtgxFile } from "./src/graph/reader.js";
import { writeMtgxFile } from "./src/graph/writer.js";
import { Graph } from "./src/graph/graph.js";
import { buildIocGraph } from "./src/tools/build-ioc-graph.js";
import type { GraphSnapshot } from "./src/types.js";
import type { LookupOutcome } from "./src/types.js";
import pkg from "./package.json" with { type: "json" };

export class UsageError extends Error {}

export type Parsed =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "mcp" }
  | { kind: "whois"; json: boolean; domain: string }
  | { kind: "dns"; json: boolean; domain: string }
  | { kind: "asn"; json: boolean; ip: string }
  | { kind: "crtsh"; json: boolean; domain: string }
  | { kind: "inspect"; json: boolean; path: string }
  | {
      kind: "graph build-ioc";
      json: boolean;
      iocType: string;
      iocValue: string;
      outputPath: string;
      title?: string;
      notes?: string[];
      overwrite: boolean;
      maxItemsPerSection?: number;
    }
  | {
      kind: "graph save";
      json: boolean;
      inputPath: string;
      outputPath: string;
      overwrite: boolean;
    }
  | { kind: "mtz build"; json: boolean };

export const HELP = `maltegoctrl - Maltego graph and OSINT control CLI (alias: maltegoctl; MCP adapter: maltego-mcp)

Usage:
  maltegoctrl <command> [options]

Lookup commands (read-only, network):
  lookup whois <domain>       Registrar, nameservers, and registration dates
  lookup dns <domain>         A / AAAA / MX / NS / TXT records
  lookup asn <ip>             ASN, prefix, country, registry, org
  lookup crtsh <domain>       Certificate Transparency entries via crt.sh

Graph commands:
  graph build-ioc [options]   Build a .mtgx graph from one IOC plus notes
  graph save [options]        Render a graph snapshot JSON file to .mtgx
  graph inspect <path>        Parse an existing .mtgx and report entities + links

Transform packaging:
  mtz build                   Build dist/maltego-mcp-transforms.mtz with the entropy scan

Other:
  mcp                         Start the MCP server over stdio
  help                        Show this help

Compatibility:
  whois, dns, asn, crtsh, inspect keep working as top-level maltegoctl-era commands.

Graph build-ioc options:
  --type <type>               Maltego entity type, for example Domain or IPv4Address
  --value <value>             IOC value
  --output <path>             Output .mtgx path, confined to MALTEGO_MCP_OUTPUT_DIR
  --title <text>              Optional graph title
  --note <text>               Optional note, repeatable
  --max-items <n>             Max items per enrichment section
  --overwrite                 Replace an existing output file

Graph save options:
  --input <path>              Graph snapshot JSON with name, entities, and links
  --output <path>             Output .mtgx path, confined to MALTEGO_MCP_OUTPUT_DIR
  --overwrite                 Replace an existing output file

Global options:
  --json                      Emit raw JSON instead of human-readable text
  --version, -v               Print version
  --help, -h                  Show help

Environment:
  MALTEGO_MCP_OUTPUT_DIR          Base dir .mtgx paths are confined to (default ~/MaltegoGraphs)
  MALTEGO_MCP_LOOKUP_TIMEOUT_MS   Per-lookup timeout in ms (default 30000)`;

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new UsageError(`${name} requires a value`);
  args.splice(i, 2);
  return value;
}

function takeRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (;;) {
    const value = takeOption(args, name);
    if (value === undefined) return values;
    values.push(value);
  }
}

function ensureNoExtra(args: string[]): void {
  if (args.length) throw new UsageError(`Unexpected arguments: ${args.join(" ")}`);
}

function requirePositional(args: string[], cmd: string, label: string): string {
  const value = args.shift();
  if (!value || value.startsWith("--")) throw new UsageError(`${cmd} requires a <${label}>`);
  ensureNoExtra(args);
  return value;
}

function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseLookup(cmd: string, args: string[], json: boolean): Parsed {
  switch (cmd) {
    case "whois":
      return { kind: "whois", json, domain: requirePositional(args, "whois", "domain") };
    case "dns":
      return { kind: "dns", json, domain: requirePositional(args, "dns", "domain") };
    case "asn":
      return { kind: "asn", json, ip: requirePositional(args, "asn", "ip") };
    case "crtsh":
      return { kind: "crtsh", json, domain: requirePositional(args, "crtsh", "domain") };
    default:
      throw new UsageError(`Unknown lookup command: ${cmd}`);
  }
}

function parseGraph(args: string[], json: boolean): Parsed {
  const subcommand = args.shift();
  if (subcommand === "inspect") {
    return { kind: "inspect", json, path: requirePositional(args, "graph inspect", "path") };
  }
  if (subcommand === "build-ioc") {
    const notes = takeRepeatedOption(args, "--note");
    const iocType = takeOption(args, "--type");
    const iocValue = takeOption(args, "--value");
    const outputPath = takeOption(args, "--output");
    const title = takeOption(args, "--title");
    const maxItemsPerSection = parsePositiveInt(takeOption(args, "--max-items"), "--max-items");
    const overwrite = takeFlag(args, "--overwrite");
    ensureNoExtra(args);
    if (!iocType) throw new UsageError("graph build-ioc requires --type");
    if (!iocValue) throw new UsageError("graph build-ioc requires --value");
    if (!outputPath) throw new UsageError("graph build-ioc requires --output");
    return {
      kind: "graph build-ioc",
      json,
      iocType,
      iocValue,
      outputPath,
      title,
      notes: notes.length > 0 ? notes : undefined,
      overwrite,
      maxItemsPerSection,
    };
  }
  if (subcommand === "save") {
    const inputPath = takeOption(args, "--input");
    const outputPath = takeOption(args, "--output");
    const overwrite = takeFlag(args, "--overwrite");
    ensureNoExtra(args);
    if (!inputPath) throw new UsageError("graph save requires --input");
    if (!outputPath) throw new UsageError("graph save requires --output");
    return { kind: "graph save", json, inputPath, outputPath, overwrite };
  }
  throw new UsageError(`Unknown graph command: ${subcommand ?? ""}`.trim());
}

export function parseArgs(argv: string[]): Parsed {
  const args = [...argv];
  if (args.includes("-h") || args.includes("--help")) return { kind: "help" };
  if (args.includes("-v") || args.includes("--version")) return { kind: "version" };

  const cmd = args.shift();
  if (!cmd || cmd === "help") return { kind: "help" };
  if (cmd === "mcp") {
    ensureNoExtra(args);
    return { kind: "mcp" };
  }

  const json = takeFlag(args, "--json");

  if (cmd === "lookup") {
    const lookup = args.shift();
    if (!lookup) throw new UsageError("lookup requires a subcommand");
    return parseLookup(lookup, args, json);
  }
  if (cmd === "graph") return parseGraph(args, json);
  if (cmd === "inspect") {
    return { kind: "inspect", json, path: requirePositional(args, "inspect", "path") };
  }
  if (cmd === "mtz") {
    const subcommand = args.shift();
    if (subcommand !== "build") throw new UsageError(`Unknown mtz command: ${subcommand ?? ""}`.trim());
    ensureNoExtra(args);
    return { kind: "mtz build", json };
  }
  if (["whois", "dns", "asn", "crtsh"].includes(cmd)) {
    return parseLookup(cmd, args, json);
  }

  throw new UsageError(`Unknown command: ${cmd}`);
}

function renderWhois(d: import("./src/lookups/whois.js").WhoisData): string {
  const lines = [`domain: ${d.domain}`];
  if (d.registrar) lines.push(`registrar: ${d.registrar}`);
  if (d.creationDate) lines.push(`created: ${d.creationDate}`);
  if (d.updatedDate) lines.push(`updated: ${d.updatedDate}`);
  if (d.registryExpiryDate) lines.push(`expires: ${d.registryExpiryDate}`);
  lines.push(`nameservers (${d.nameservers.length}):`);
  for (const ns of d.nameservers) lines.push(`  ${ns}`);
  return lines.join("\n");
}

function renderDns(d: import("./src/lookups/dns.js").DnsData): string {
  const lines = [`domain: ${d.domain}`];
  const section = (label: string, items: string[]): void => {
    lines.push(`${label} (${items.length}):`);
    for (const i of items) lines.push(`  ${i}`);
  };
  section("A", d.a);
  section("AAAA", d.aaaa);
  lines.push(`MX (${d.mx.length}):`);
  for (const m of d.mx) lines.push(`  ${m.priority} ${m.exchange}`);
  section("NS", d.ns);
  section("TXT", d.txt);
  return lines.join("\n");
}

function renderAsn(d: import("./src/lookups/asn.js").AsnData): string {
  const lines = [
    `ip: ${d.ip}`,
    `asn: AS${d.asn}`,
    `prefix: ${d.prefix}`,
    `country: ${d.country}`,
    `registry: ${d.registry}`,
    `allocated: ${d.allocated}`,
  ];
  if (d.organization) lines.push(`org: ${d.organization}`);
  return lines.join("\n");
}

function renderCrtsh(d: import("./src/lookups/crtsh.js").CrtshData): string {
  if (d.certs.length === 0) return `No certificate transparency entries for ${d.domain}.`;
  const lines = [`${d.domain}: ${d.certs.length} certificate(s)`];
  for (const c of d.certs) {
    lines.push("");
    lines.push(`  ${c.commonName}  (id ${c.id})`);
    lines.push(`    issuer: ${c.issuer}`);
    lines.push(`    valid: ${c.notBefore} -> ${c.notAfter}`);
    if (c.sans.length) lines.push(`    sans: ${c.sans.join(", ")}`);
  }
  return lines.join("\n");
}

interface GraphInspection {
  path: string;
  name: string;
  entityCount: number;
  linkCount: number;
  entities: Array<{ id: string; type: string; value: string; properties: Record<string, string> }>;
  links: Array<{ id: string; from: string; to: string; label?: string }>;
}

function inspectionOf(graph: Graph, path: string): GraphInspection {
  const snapshot = graph.snapshot();
  return {
    path,
    name: snapshot.name,
    entityCount: graph.entityCount(),
    linkCount: graph.linkCount(),
    entities: snapshot.entities.map((e) => ({ id: e.id, type: e.type, value: e.value, properties: e.properties })),
    links: snapshot.links.map((l) => ({ id: l.id, from: l.from, to: l.to, label: l.label })),
  };
}

function renderInspect(g: GraphInspection): string {
  const lines = [
    `path: ${g.path}`,
    `name: ${g.name}`,
    `entities: ${g.entityCount}`,
    `links: ${g.linkCount}`,
  ];
  if (g.entities.length) {
    lines.push("entities:");
    for (const e of g.entities) lines.push(`  ${e.id}  ${e.type}  ${e.value}`);
  }
  if (g.links.length) {
    lines.push("links:");
    for (const l of g.links) lines.push(`  ${l.id}  ${l.from} -> ${l.to}${l.label ? `  [${l.label}]` : ""}`);
  }
  return lines.join("\n");
}

function unwrap<T>(outcome: LookupOutcome<T>): T {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.data;
}

async function ensureWritable(path: string, overwrite: boolean): Promise<void> {
  if (overwrite) return;
  try {
    await access(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  throw new ToolFileSystemError(
    `file already exists, refusing to overwrite (pass --overwrite): ${path}`,
    path,
  );
}

function graphFromSnapshot(snapshot: GraphSnapshot): Graph {
  if (!snapshot || !Array.isArray(snapshot.entities) || !Array.isArray(snapshot.links)) {
    throw new ToolValidationError("graph snapshot must include entities and links arrays");
  }
  const graph = new Graph(snapshot.id || "g-cli-save", snapshot.name || "maltegoctrl graph");
  const idMap = new Map<string, string>();
  for (const entity of snapshot.entities) {
    const added = graph.addEntity({
      type: entity.type,
      value: entity.value,
      properties: entity.properties ?? {},
      position: entity.position,
    });
    idMap.set(entity.id, added.id);
  }
  for (const link of snapshot.links) {
    const from = idMap.get(link.from);
    const to = idMap.get(link.to);
    if (!from || !to) {
      throw new ToolValidationError(`graph snapshot link references an unknown entity: ${link.id}`);
    }
    graph.addLink({
      from,
      to,
      label: link.label,
      properties: link.properties ?? {},
    });
  }
  return graph;
}

function repoRootFromImportMeta(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return here.endsWith("dist") ? dirname(here) : here;
}

function defaultBuildMtz(): Promise<void> {
  const repoRoot = repoRootFromImportMeta();
  const script = resolve(repoRoot, "scripts", "python-tool.mjs");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, "build-mtz"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`mtz build failed with exit ${code ?? 1}`));
    });
  });
}

export interface CliDeps {
  out: (s: string) => void;
  err: (s: string) => void;
  config: MaltegoConfig;
  whois: (domain: string, timeoutMs: number) => Promise<LookupOutcome<import("./src/lookups/whois.js").WhoisData>>;
  dns: (domain: string, timeoutMs: number) => Promise<LookupOutcome<import("./src/lookups/dns.js").DnsData>>;
  asn: (ip: string, timeoutMs: number) => Promise<LookupOutcome<import("./src/lookups/asn.js").AsnData>>;
  crtsh: (domain: string, timeoutMs: number) => Promise<LookupOutcome<import("./src/lookups/crtsh.js").CrtshData>>;
  readGraph: (path: string) => Promise<Graph>;
  writeGraph: (graph: Graph, path: string) => Promise<void>;
  readText: (path: string) => Promise<string>;
  buildMtz: () => Promise<void>;
  serve: () => Promise<void>;
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    deps.err("");
    deps.err(HELP);
    return 2;
  }

  if (parsed.kind === "help") {
    deps.out(HELP);
    return 0;
  }
  if (parsed.kind === "version") {
    deps.out(pkg.version);
    return 0;
  }
  if (parsed.kind === "mcp") {
    await deps.serve();
    return 0;
  }

  const emit = (raw: unknown, render: () => string, json: boolean): void => {
    deps.out(json ? JSON.stringify(raw, null, 2) : render());
  };

  try {
    switch (parsed.kind) {
      case "whois": {
        const d = unwrap(await deps.whois(parsed.domain, deps.config.lookupTimeoutMs));
        emit(d, () => renderWhois(d), parsed.json);
        return 0;
      }
      case "dns": {
        const d = unwrap(await deps.dns(parsed.domain, deps.config.lookupTimeoutMs));
        emit(d, () => renderDns(d), parsed.json);
        return 0;
      }
      case "asn": {
        const d = unwrap(await deps.asn(parsed.ip, deps.config.lookupTimeoutMs));
        emit(d, () => renderAsn(d), parsed.json);
        return 0;
      }
      case "crtsh": {
        const d = unwrap(await deps.crtsh(parsed.domain, deps.config.lookupTimeoutMs));
        emit(d, () => renderCrtsh(d), parsed.json);
        return 0;
      }
      case "inspect": {
        const resolved = confineToOutputDir(parsed.path, deps.config.outputDir);
        const graph = await deps.readGraph(resolved);
        const view = inspectionOf(graph, resolved);
        emit(view, () => renderInspect(view), parsed.json);
        return 0;
      }
      case "graph build-ioc": {
        const outPath = confineToOutputDir(parsed.outputPath, deps.config.outputDir);
        await ensureWritable(outPath, parsed.overwrite);
        const graph = buildIocGraph({
          ioc: { type: parsed.iocType, value: parsed.iocValue },
          outputPath: outPath,
          title: parsed.title,
          notes: parsed.notes,
          maxItemsPerSection: parsed.maxItemsPerSection,
        });
        await deps.writeGraph(graph, outPath);
        const view = { path: outPath, entityCount: graph.entityCount(), linkCount: graph.linkCount() };
        emit(view, () => `path: ${outPath}\nentities: ${view.entityCount}\nlinks: ${view.linkCount}`, parsed.json);
        return 0;
      }
      case "graph save": {
        const outPath = confineToOutputDir(parsed.outputPath, deps.config.outputDir);
        await ensureWritable(outPath, parsed.overwrite);
        const graph = graphFromSnapshot(JSON.parse(await deps.readText(parsed.inputPath)) as GraphSnapshot);
        await deps.writeGraph(graph, outPath);
        const view = { path: outPath, entityCount: graph.entityCount(), linkCount: graph.linkCount() };
        emit(view, () => `path: ${outPath}\nentities: ${view.entityCount}\nlinks: ${view.linkCount}`, parsed.json);
        return 0;
      }
      case "mtz build": {
        await deps.buildMtz();
        const view = { path: "dist/maltego-mcp-transforms.mtz" };
        emit(view, () => "built: dist/maltego-mcp-transforms.mtz", parsed.json);
        return 0;
      }
    }
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  return 0;
}

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
  const config = resolveConfig({ env: process.env });
  run(process.argv.slice(2), {
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    config,
    whois: whoisLookup,
    dns: dnsLookup,
    asn: asnLookup,
    crtsh: crtshLookup,
    readGraph: (path) => readMtgxFile(path, "g-inspect"),
    writeGraph: writeMtgxFile,
    readText: (path) => readFile(path, "utf8"),
    buildMtz: defaultBuildMtz,
    serve: async () => {
      const { serve } = await import("./mcp-server.js");
      await serve();
    },
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
