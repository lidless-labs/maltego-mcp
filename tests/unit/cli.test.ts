import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { UsageError, parseArgs, run, type CliDeps } from "../../cli.js";
import type { MaltegoConfig } from "../../src/config.js";
import { Graph } from "../../src/graph/graph.js";
import type { LookupOutcome } from "../../src/types.js";

const CONFIG: MaltegoConfig = { outputDir: "/tmp/maltego-graphs", lookupTimeoutMs: 30_000 };
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { bin?: Record<string, string> };

function ok<T>(data: T): LookupOutcome<T> {
  return { ok: true, data };
}

function capture(over: Partial<CliDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    config: CONFIG,
    whois: vi.fn(),
    dns: vi.fn(),
    asn: vi.fn(),
    crtsh: vi.fn(),
    readGraph: vi.fn(),
    writeGraph: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn(),
    buildMtz: vi.fn().mockResolvedValue(undefined),
    serve: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return { out, err, deps };
}

describe("parseArgs", () => {
  it("keeps the ctrl and compatibility package bins", () => {
    expect(packageJson.bin).toMatchObject({
      maltegoctrl: "./dist/cli.js",
      maltegoctl: "./dist/cli.js",
      "maltego-mcp": "./dist/mcp-bin.js",
    });
  });

  it("routes lookup commands with their positional", () => {
    expect(parseArgs(["whois", "example.com"])).toEqual({ kind: "whois", json: false, domain: "example.com" });
    expect(parseArgs(["lookup", "whois", "example.com"])).toEqual({ kind: "whois", json: false, domain: "example.com" });
    expect(parseArgs(["dns", "example.com", "--json"])).toEqual({ kind: "dns", json: true, domain: "example.com" });
    expect(parseArgs(["asn", "192.0.2.10"])).toEqual({ kind: "asn", json: false, ip: "192.0.2.10" });
    expect(parseArgs(["crtsh", "example.com"])).toEqual({ kind: "crtsh", json: false, domain: "example.com" });
    expect(parseArgs(["inspect", "graph.mtgx"])).toEqual({ kind: "inspect", json: false, path: "graph.mtgx" });
    expect(parseArgs(["graph", "inspect", "graph.mtgx"])).toEqual({ kind: "inspect", json: false, path: "graph.mtgx" });
  });

  it("routes graph and mtz commands", () => {
    expect(parseArgs([
      "graph",
      "build-ioc",
      "--type",
      "Domain",
      "--value",
      "evil.example",
      "--output",
      "ioc.mtgx",
      "--note",
      "triage",
      "--overwrite",
    ])).toEqual({
      kind: "graph build-ioc",
      json: false,
      iocType: "Domain",
      iocValue: "evil.example",
      outputPath: "ioc.mtgx",
      title: undefined,
      notes: ["triage"],
      overwrite: true,
      maxItemsPerSection: undefined,
    });
    expect(parseArgs(["graph", "save", "--input", "graph.json", "--output", "graph.mtgx"])).toEqual({
      kind: "graph save",
      json: false,
      inputPath: "graph.json",
      outputPath: "graph.mtgx",
      overwrite: false,
    });
    expect(parseArgs(["mtz", "build"])).toEqual({ kind: "mtz build", json: false });
  });

  it("routes help, version, and mcp", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
    expect(parseArgs(["help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-v"])).toEqual({ kind: "version" });
    expect(parseArgs(["--version"])).toEqual({ kind: "version" });
    expect(parseArgs(["mcp"])).toEqual({ kind: "mcp" });
  });

  it("rejects bad input with UsageError", () => {
    expect(() => parseArgs(["bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["whois"])).toThrow(UsageError);
    expect(() => parseArgs(["asn"])).toThrow(UsageError);
    expect(() => parseArgs(["whois", "example.com", "extra"])).toThrow(UsageError);
    expect(() => parseArgs(["mcp", "extra"])).toThrow(UsageError);
    expect(() => parseArgs(["whois", "--json"])).toThrow(UsageError);
  });
});

describe("run", () => {
  it("prints human whois output and exits 0", async () => {
    const whois = vi.fn().mockResolvedValue(
      ok({ domain: "example.com", raw: "", registrar: "Example Registrar", nameservers: ["NS1.EXAMPLE.COM"] }),
    );
    const { out, deps } = capture({ whois });
    expect(await run(["whois", "example.com"], deps)).toBe(0);
    expect(whois).toHaveBeenCalledWith("example.com", 30_000);
    const text = out.join("\n");
    expect(text).toContain("registrar: Example Registrar");
    expect(text).toContain("NS1.EXAMPLE.COM");
  });

  it("emits raw JSON with --json", async () => {
    const payload = { domain: "example.com", a: ["192.0.2.10"], aaaa: [], mx: [], ns: [], txt: [] };
    const dns = vi.fn().mockResolvedValue(ok(payload));
    const { out, deps } = capture({ dns });
    expect(await run(["dns", "example.com", "--json"], deps)).toBe(0);
    expect(dns).toHaveBeenCalledWith("example.com", 30_000);
    expect(JSON.parse(out.join("\n"))).toEqual(payload);
  });

  it("passes the configured timeout to crtsh", async () => {
    const crtsh = vi.fn().mockResolvedValue(ok({ domain: "example.com", certs: [] }));
    const { out, deps } = capture({ crtsh });
    expect(await run(["crtsh", "example.com"], deps)).toBe(0);
    expect(crtsh).toHaveBeenCalledWith("example.com", 30_000);
    expect(out.join("\n")).toContain("No certificate transparency entries");
  });

  it("renders asn data", async () => {
    const asn = vi.fn().mockResolvedValue(
      ok({ ip: "192.0.2.10", asn: 64500, prefix: "192.0.2.0/24", country: "US", registry: "arin", allocated: "1999-01-01", organization: "EXAMPLE-AS" }),
    );
    const { out, deps } = capture({ asn });
    expect(await run(["asn", "192.0.2.10"], deps)).toBe(0);
    expect(asn).toHaveBeenCalledWith("192.0.2.10", 30_000);
    const text = out.join("\n");
    expect(text).toContain("asn: AS64500");
    expect(text).toContain("org: EXAMPLE-AS");
  });

  it("inspects a graph without writing a file", async () => {
    const graph = new Graph("g-inspect", "demo");
    const a = graph.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const b = graph.addEntity({ type: "IPv4Address", value: "192.0.2.10", properties: {} });
    graph.addLink({ from: a.id, to: b.id, label: "A record", properties: {} });
    const readGraph = vi.fn().mockResolvedValue(graph);
    const { out, deps } = capture({ readGraph });
    expect(await run(["inspect", "demo.mtgx"], deps)).toBe(0);
    // path is confined to outputDir before reaching readGraph
    expect(readGraph).toHaveBeenCalledWith("/tmp/maltego-graphs/demo.mtgx");
    const text = out.join("\n");
    expect(text).toContain("entities: 2");
    expect(text).toContain("links: 1");
    expect(text).toContain("A record");
  });

  it("builds an IOC graph and writes it inside outputDir", async () => {
    const writeGraph = vi.fn().mockResolvedValue(undefined);
    const { out, deps } = capture({ writeGraph });

    expect(await run([
      "graph",
      "build-ioc",
      "--type",
      "Domain",
      "--value",
      "evil.example",
      "--output",
      "ioc.mtgx",
      "--note",
      "triage",
    ], deps)).toBe(0);

    expect(writeGraph).toHaveBeenCalledOnce();
    expect(writeGraph.mock.calls[0][1]).toBe("/tmp/maltego-graphs/ioc.mtgx");
    expect(out.join("\n")).toContain("entities:");
  });

  it("saves a graph snapshot JSON as .mtgx", async () => {
    const readText = vi.fn().mockResolvedValue(JSON.stringify({
      id: "g",
      name: "snapshot",
      entities: [
        { id: "old-a", type: "Domain", value: "example.com", properties: {} },
        { id: "old-b", type: "IPv4Address", value: "192.0.2.10", properties: {} },
      ],
      links: [
        { id: "old-l", from: "old-a", to: "old-b", label: "A record", properties: {} },
      ],
    }));
    const writeGraph = vi.fn().mockResolvedValue(undefined);
    const { out, deps } = capture({ readText, writeGraph });

    expect(await run(["graph", "save", "--input", "graph.json", "--output", "saved.mtgx"], deps)).toBe(0);

    expect(readText).toHaveBeenCalledWith("graph.json");
    expect(writeGraph).toHaveBeenCalledOnce();
    expect(writeGraph.mock.calls[0][1]).toBe("/tmp/maltego-graphs/saved.mtgx");
    expect(out.join("\n")).toContain("links: 1");
  });

  it("delegates mtz build to the transform packaging runner", async () => {
    const buildMtz = vi.fn().mockResolvedValue(undefined);
    const { out, deps } = capture({ buildMtz });

    expect(await run(["mtz", "build"], deps)).toBe(0);

    expect(buildMtz).toHaveBeenCalledOnce();
    expect(out.join("\n")).toContain("maltego-mcp-transforms.mtz");
  });

  it("returns exit 1 and prints the error when a lookup fails", async () => {
    const whois = vi.fn().mockResolvedValue({ ok: false, error: "whois lookup failed: ENOTFOUND", retriable: true });
    const { err, deps } = capture({ whois });
    expect(await run(["whois", "nope.invalid"], deps)).toBe(1);
    expect(err.join("\n")).toContain("ENOTFOUND");
  });

  it("returns exit 1 when the graph file cannot be read", async () => {
    const readGraph = vi.fn().mockRejectedValue(new Error("ENOENT: no such file"));
    const { err, deps } = capture({ readGraph });
    expect(await run(["inspect", "missing.mtgx"], deps)).toBe(1);
    expect(err.join("\n")).toContain("ENOENT");
  });

  it("returns exit 2 and prints help on usage error", async () => {
    const { err, deps } = capture();
    expect(await run(["bogus"], deps)).toBe(2);
    expect(err.join("\n")).toContain("Usage:");
  });

  it("prints version without performing any lookup", async () => {
    const whois = vi.fn();
    const { out, deps } = capture({ whois });
    expect(await run(["--version"], deps)).toBe(0);
    expect(out.join("\n")).toContain(".");
    expect(whois).not.toHaveBeenCalled();
  });

  it("delegates `mcp` to serve()", async () => {
    const serve = vi.fn().mockResolvedValue(undefined);
    const { deps } = capture({ serve });
    expect(await run(["mcp"], deps)).toBe(0);
    expect(serve).toHaveBeenCalledOnce();
  });
});
