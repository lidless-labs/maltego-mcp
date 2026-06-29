import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolveConfig, type MaltegoConfig } from "./src/config.js";
import { confineToOutputDir } from "./src/server/paths.js";
import { whoisLookup } from "./src/lookups/whois.js";
import { dnsLookup } from "./src/lookups/dns.js";
import { asnLookup } from "./src/lookups/asn.js";
import { crtshLookup } from "./src/lookups/crtsh.js";
import { readMtgxFile } from "./src/graph/reader.js";
import type { Graph } from "./src/graph/graph.js";
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
  | { kind: "inspect"; json: boolean; path: string };

export const HELP = `maltegoctl - read-only OSINT lookup + .mtgx inspect CLI for maltego-mcp

Usage:
  maltegoctl <command> [options]

OSINT lookups (read-only, network):
  whois <domain>     Registrar, nameservers, and registration dates
  dns <domain>       A / AAAA / MX / NS / TXT records
  asn <ip>           ASN, prefix, country, registry, org (Team Cymru)
  crtsh <domain>     Certificate Transparency entries via crt.sh

Graph inspect (read-only, local file):
  inspect <path>     Parse an existing .mtgx and report its entities + links

Other:
  mcp                Start the MCP server over stdio
  help               Show this help

Global options:
  --json             Emit raw JSON instead of human-readable text
  --version, -v      Print version
  --help, -h         Show help

Environment:
  MALTEGO_MCP_OUTPUT_DIR          Base dir .mtgx paths are confined to (default ~/MaltegoGraphs)
  MALTEGO_MCP_LOOKUP_TIMEOUT_MS   Per-lookup timeout in ms, crt.sh only (default 30000)`;

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function ensureNoExtra(args: string[]): void {
  if (args.length) throw new UsageError(`Unexpected arguments: ${args.join(" ")}`);
}

// Pull the single required positional for a lookup/inspect command.
function requirePositional(args: string[], cmd: string, label: string): string {
  const value = args.shift();
  if (!value || value.startsWith("--")) throw new UsageError(`${cmd} requires a <${label}>`);
  ensureNoExtra(args);
  return value;
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

  // Pull global flags before reading the positional.
  const json = takeFlag(args, "--json");

  switch (cmd) {
    case "whois":
      return { kind: "whois", json, domain: requirePositional(args, "whois", "domain") };
    case "dns":
      return { kind: "dns", json, domain: requirePositional(args, "dns", "domain") };
    case "asn":
      return { kind: "asn", json, ip: requirePositional(args, "asn", "ip") };
    case "crtsh":
      return { kind: "crtsh", json, domain: requirePositional(args, "crtsh", "domain") };
    case "inspect":
      return { kind: "inspect", json, path: requirePositional(args, "inspect", "path") };
    default:
      throw new UsageError(`Unknown command: ${cmd}`);
  }
}

// ---------- renderers (concise human-readable; --json bypasses these) ----------

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

// A serializable view of an inspected graph (no Graph internals, no file write).
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

// Unwrap a lookup outcome: print data on success, throw on failure so the
// command exits 1 (a failed lookup is a runtime error, not a usage error).
function unwrap<T>(outcome: LookupOutcome<T>): T {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.data;
}

export interface CliDeps {
  out: (s: string) => void;
  err: (s: string) => void;
  config: MaltegoConfig;
  whois: (domain: string) => Promise<LookupOutcome<import("./src/lookups/whois.js").WhoisData>>;
  dns: (domain: string) => Promise<LookupOutcome<import("./src/lookups/dns.js").DnsData>>;
  asn: (ip: string) => Promise<LookupOutcome<import("./src/lookups/asn.js").AsnData>>;
  crtsh: (domain: string, timeoutMs: number) => Promise<LookupOutcome<import("./src/lookups/crtsh.js").CrtshData>>;
  readGraph: (path: string) => Promise<Graph>;
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
        const d = unwrap(await deps.whois(parsed.domain));
        emit(d, () => renderWhois(d), parsed.json);
        return 0;
      }
      case "dns": {
        const d = unwrap(await deps.dns(parsed.domain));
        emit(d, () => renderDns(d), parsed.json);
        return 0;
      }
      case "asn": {
        const d = unwrap(await deps.asn(parsed.ip));
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
    }
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  return 0;
}

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing.
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
