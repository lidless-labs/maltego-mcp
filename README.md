<p align="center">
  <img src="docs/assets/maltego-mcp-banner.jpg" alt="maltego-mcp banner" width="900">
</p>

<h1 align="center">maltego-mcp</h1>

<p align="center"><strong>An MCP server that lets an LLM author Maltego graph files and run primitive OSINT lookups.</strong></p>

<p align="center">
  <a href="https://lidless.dev/maltego-mcp"><b>Website</b></a>
</p>

<p align="center">
  <img src="https://shieldcn.dev/npm/maltego-mcp.svg" alt="npm version">
  <img src="https://shieldcn.dev/github/ci/lidless-labs/maltego-mcp.svg?branch=main&workflow=ci.yml" alt="ci">
  <img src="https://shieldcn.dev/badge/MCP-server-8A2BE2.svg" alt="MCP server">
  <img src="https://shieldcn.dev/badge/license-MIT-green.svg" alt="license MIT">
</p>

maltego-mcp is a Model Context Protocol (MCP) server that lets an LLM author Maltego `.mtgx` graph files and run primitive OSINT lookups (whois, DNS, ASN, crt.sh) from inside an agent session. It exists because graph-driven OSINT investigation in Maltego Desktop is normally point-and-click work, and an agent that can already reason over indicators should be able to produce the graph directly instead of dictating clicks to a human. It differs from a Maltego transform pack by living in the agent layer first: the graph is built and saved to disk by tool calls, then opened in Maltego, so it works even on the Basic plan and without paid connectors. A second optional layer (Phase B) does add native right-click transforms inside Maltego Desktop for teams that want that too.

## What it does

maltego-mcp is an **MCP server for Maltego Desktop OSINT** that gives an LLM agent a small, typed toolset for building Maltego graphs and enriching indicators of compromise. An agent calls these tools to create a graph, add entities and links, run whois / DNS / ASN / certificate-transparency lookups, expand an IP or domain into a pivot map, and write the result to a `.mtgx` file you open in Maltego Graph Desktop. Keywords: Maltego, MCP server, OSINT, threat intelligence, graph, whois, DNS, ASN, crt.sh, indicators of compromise.

It ships as two cooperating layers:

- **Phase A (TypeScript MCP server):** lets an LLM author Maltego `.mtgx` graph files and run primitive OSINT lookups (whois / DNS / ASN / crt.sh). Graphs land on disk and you open them in Maltego Desktop.
- **Phase B (Python TRX transforms in a `.mtz`):** adds right-click pivots into MISP, TheHive, Cortex, and the bundled MITRE ATT&CK dataset directly inside Maltego Desktop. See [`transforms/README.md`](transforms/README.md).

The two phases share the repo, nothing else. Either layer can be uninstalled without breaking the other.

## Install

```bash
npm install -g maltego-mcp
```

Or from source (required for Phase B transforms):

```bash
git clone https://github.com/lidless-labs/maltego-mcp.git
cd maltego-mcp
npm install
npm run build
```

## Quickstart

Install globally and register it with an MCP client:

```bash
npm install -g maltego-mcp
```

Add it to your MCP client config (Claude Desktop shown; the same `command` works in any stdio MCP client):

```json
{
  "mcpServers": {
    "maltego": {
      "command": "maltego-mcp"
    }
  }
}
```

Restart the client and the `maltego_*` tools appear. From a source checkout, point the client at the built entrypoint instead:

```json
{
  "mcpServers": {
    "maltego": {
      "command": "node",
      "args": ["/absolute/path/to/maltego-mcp/dist/mcp-bin.js"]
    }
  }
}
```

> Status: the npm package is published (latest tag `v0.3.0`); `0.4.0` is in development and ships from a source build. Phase B transforms require a source checkout. See [Install](#install) for all client recipes.

## Tools (Phase A)

maltego-mcp registers **13 MCP tools**, verified against `src/tools/index.ts`:

**Graph authoring**
- `maltego_create_graph(name)` — returns `graphId`
- `maltego_add_entity(graphId, type, value, properties?)` — returns `entityId`
- `maltego_add_link(graphId, from, to, label?, properties?)` — returns `linkId`
- `maltego_save_graph(graphId, path, overwrite?)` — writes `.mtgx`
- `maltego_load_graph(path)` — parses an existing `.mtgx` into a new handle

**Primitive lookups**
- `maltego_whois(domain)` — registrar, nameservers, dates
- `maltego_dns(domain)` — A/AAAA/MX/NS/TXT
- `maltego_asn(ip)` — Team Cymru ASN, prefix, country, org
- `maltego_crtsh(domain)` — certificate transparency entries

**Convenience expanders**
- `maltego_expand_ip(ip, outputPath, overwrite?)` — IP + ASN + netblock, saved as `.mtgx`
- `maltego_expand_domain(domain, outputPath, overwrite?)` — domain + whois + DNS + ASN per A record
- `maltego_expand_hash(hash, outputPath, algorithm?, overwrite?)` — hash entity (extend in later versions)
- `maltego_build_ioc_graph(ioc, outputPath, ...)` — one IOC plus enrichment summaries from other MCPs, saved as `.mtgx`

### Entity types

Standard Maltego ontology: `IPv4Address`, `IPv6Address`, `Domain`, `URL`, `Hash`, `EmailAddress`, `Netblock`, `AS`, `Website`, `Company`, `Person`. For concepts without a standard type, use `Phrase` with a category prefix (`[T1566] Phishing`, `[TheHive] Case #42`).

### Composing with other MCPs

maltego-mcp does not embed third-party threat-intel clients. For MISP events, ATT&CK techniques, Cortex reports, etc., call the dedicated MCPs (`misp-mcp`, `mitre-mcp`, `cortex-mcp`, etc.) and pipe results into `maltego_add_entity` / `maltego_add_link`. Or, for in-Maltego pivots, install Phase B (below).

For the common "one IOC, many enrichments" case, use
`maltego_build_ioc_graph`: call `misp-mcp`, `thehive-mcp`, `cortex-mcp`, and
`mitre-mcp` first, summarize their results into the tool's `mispEvents`,
`thehiveCases`, `cortexReports`, and `attackTechniques` arrays, then save one
combined `.mtgx`. The tool keeps service calls out of this package while still
making the graph bridge a single MCP call.

## Configuration

Both env vars are optional.

| Variable | Default | Description |
|---|---|---|
| `MALTEGO_MCP_OUTPUT_DIR` | `~/MaltegoGraphs` | Default output directory for `.mtgx` files |
| `MALTEGO_MCP_LOOKUP_TIMEOUT_MS` | `30000` | Per-lookup timeout in ms for whois, DNS, ASN, and crt.sh |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "maltego": {
      "command": "maltego-mcp"
    }
  }
}
```

Or, when running from a source checkout instead of the global npm install:

```json
{
  "mcpServers": {
    "maltego": {
      "command": "node",
      "args": ["/absolute/path/to/maltego-mcp/dist/mcp-bin.js"]
    }
  }
}
```

Restart Claude Desktop. The `maltego_*` tools should appear.

### Claude Code

```bash
claude mcp add maltego -- maltego-mcp
```

Or from a source checkout:

```bash
claude mcp add maltego -- node /absolute/path/to/maltego-mcp/dist/mcp-bin.js
```

Add `--scope user` to make it available from any directory instead of only the current project.

### OpenClaw

**Recommended: install as an OpenClaw plugin via ClawHub.**

```bash
openclaw plugins install clawhub:maltego
openclaw plugins list   # confirm "maltego" is registered
```

This installs the same package as a native OpenClaw plugin — tool calls go through the plugin SDK directly instead of spawning a separate stdio MCP process. Configure `outputDir` and `lookupTimeoutMs` in OpenClaw's plugin config UI or via the JSON config file. Restart the OpenClaw gateway after installing so the plugin is picked up.

**Or, register as a stdio MCP server (manual):**

```bash
openclaw mcp set maltego '{
  "command": "maltego-mcp"
}'
```

Or, when running from a source checkout:

```bash
openclaw mcp set maltego '{
  "command": "node",
  "args": ["/absolute/path/to/maltego-mcp/dist/mcp-bin.js"]
}'
```

Then restart the OpenClaw gateway so the new server is picked up and confirm registration with `openclaw mcp list`.

### Hermes Agent

[Hermes Agent](https://github.com/NousResearch/hermes-agent) reads MCP config from `~/.hermes/config.yaml` under the `mcp_servers` key. Add an entry:

```yaml
mcp_servers:
  maltego:
    command: "maltego-mcp"
```

Or, when running from a source checkout:

```yaml
mcp_servers:
  maltego:
    command: "node"
    args: ["/absolute/path/to/maltego-mcp/dist/mcp-bin.js"]
```

Then reload MCP from inside a Hermes session:

```
/reload-mcp
```

### Codex CLI

[Codex CLI](https://github.com/openai/codex) registers MCP servers via `codex mcp add`:

```bash
codex mcp add maltego -- maltego-mcp
```

Or from a source checkout:

```bash
codex mcp add maltego -- node /absolute/path/to/maltego-mcp/dist/mcp-bin.js
```

Codex writes the entry to `~/.codex/config.toml` under `[mcp_servers.maltego]`. Verify with `codex mcp list`.

## Requirements

- Node.js 20+
- Maltego Graph Desktop (Basic, Pro, or Enterprise) for either layer to be useful
- Phase B only: Python 3.11+ on the Maltego host

### Maltego Basic compatibility

The default workflow is Basic-friendly: generate `.mtgx` files with Phase A,
then open or import them in Maltego Graph Desktop. The included demo graph is
kept under 24 entities so it stays useful on the Basic plan's per-transform
result limit. Local TRX transforms are supported on Basic, but their live
results are still subject to your Maltego plan and connector limits. See
Maltego's current [products and plans](https://docs.maltego.com/en/support/solutions/articles/15000036759-maltego-products-and-plans)
and [Basic data access notes](https://docs.maltego.com/en/support/solutions/articles/15000058711-data-pass-and-connectors-for-maltego-community-edition-version-4-8-0-).

## CLI

The same package ships `maltegoctrl` for shells, cron, and CI. `maltegoctl` remains as a compatibility alias. It shares lookup, graph-writing, graph-reading, and transform packaging paths with the MCP server and reads the same env config.

```bash
npx -p maltego-mcp maltegoctrl lookup whois example.com
# or, installed globally:
maltegoctrl lookup whois example.com
maltegoctrl lookup dns example.com --json
maltegoctrl lookup asn 192.0.2.10
maltegoctrl lookup crtsh example.com
maltegoctrl graph inspect graph.mtgx
maltegoctrl graph build-ioc --type Domain --value evil.example --output evil.mtgx --note "triage"
maltegoctrl graph save --input graph-snapshot.json --output graph.mtgx
maltegoctrl mtz build
```

Run `maltegoctrl help` for the full command and flag list. `--json` emits raw JSON instead of the concise human-readable summary. Graph paths are confined to `MALTEGO_MCP_OUTPUT_DIR` with realpath checks so symlinks inside the output directory cannot point writes outside it. Exit codes: `0` success, `1` runtime error (a lookup failed, the host was unreachable, or the `.mtgx` could not be read or written), `2` usage error (unknown command/flag or a missing argument).

Environment:

| Variable | Default | Description |
|---|---|---|
| `MALTEGO_MCP_OUTPUT_DIR` | `~/MaltegoGraphs` | Base directory graph paths are confined to |
| `MALTEGO_MCP_LOOKUP_TIMEOUT_MS` | `30000` | Per-lookup timeout in ms for whois, DNS, ASN, and crt.sh |

### Starting the MCP server

`maltegoctrl mcp` (or the back-compat `maltego-mcp` bin) starts the stdio MCP server. If a launcher referenced the file path `dist/mcp-server.js` directly, it keeps working; new launchers can point at `dist/mcp-bin.js` (or `dist/cli.js mcp`). Launchers that use the `maltego-mcp` bin name need no change.

## Basic-friendly demo graph

Generate a no-network `.mtgx` demo that shows how an IOC can connect to MISP,
TheHive, Cortex, MITRE ATT&CK, and a triage playbook without requiring API keys
or paid Maltego connectors:

```bash
npm run demo:basic
```

Output defaults to `dist/maltego-mcp-basic-soc-demo.mtgx`. Open that file in
Maltego Graph Desktop. To choose a different path:

```bash
npm run demo:basic -- --output ~/MaltegoGraphs/basic-soc-demo.mtgx
```

The demo uses documentation-safe indicators such as `203.0.113.42` and
`example.invalid`; it is meant to prove the graph format and visual workflow,
not to perform live enrichment.

## Phase B: in-Maltego transforms (.mtz)

A separate Python transform layer ships right-click pivots into MISP, TheHive, Cortex, and ATT&CK directly inside Maltego Desktop. See [`transforms/README.md`](transforms/README.md) for full setup.

Quick start (from a source checkout, on the Maltego host):

```bash
npm run setup:transforms     # creates transforms/.venv with maltego-trx pinned
npm run build:mtz            # writes dist/maltego-mcp-transforms.mtz
# Then in Maltego: Import -> Configuration -> dist/maltego-mcp-transforms.mtz
```

The build bakes the absolute path of `transforms/.venv` into the manifest, so the `.mtz` is tied to the host that built it. Re-run `npm run build:mtz` if the repo moves.

## Example prompts

> Build me a Maltego graph for the domain `example.com` with whois, DNS, and ASN expansion.

Calls `maltego_expand_domain` and returns the path to the saved `.mtgx`.

> Pivot from this IP — give me ASN + netblock as a Maltego graph.

Calls `maltego_expand_ip`.

> Look up the cert transparency log for `example.com`.

Calls `maltego_crtsh` and returns matching certificates.

> Build a Maltego graph for this hash using the MISP events, TheHive cases,
> Cortex reports, and ATT&CK techniques we already gathered.

Calls `maltego_build_ioc_graph` with an input shaped like:

```json
{
  "ioc": {
    "type": "Hash",
    "value": "d41d8cd98f00b204e9800998ecf8427e",
    "properties": { "algorithm": "md5" }
  },
  "outputPath": "hash-investigation.mtgx",
  "mispEvents": [{ "id": 1001, "info": "demo phishing cluster" }],
  "thehiveCases": [{ "id": 42, "title": "Phishing triage", "severity": "high" }],
  "cortexReports": [{ "analyzer": "HashLookup", "verdict": "suspicious" }],
  "attackTechniques": [{ "id": "T1566", "name": "Phishing", "tactic": "Initial Access" }]
}
```

## Why not a Maltego transform pack alone?

Native Maltego transforms are great once an investigation is already open in the
Desktop client, but they assume a human is driving the canvas and, for live
remote data, often a paid plan or connector. maltego-mcp puts graph authoring in
the agent layer so an LLM can build and save a `.mtgx` from indicators it is
already reasoning about, with no canvas clicks and no connector requirement. If
you also want in-Maltego right-click pivots, Phase B ships them as a `.mtz` you
import. You are not forced to choose: run the MCP server, the transforms, or
both.

## Why not just hand the LLM raw whois/DNS tooling?

You can, but then the model has to remember the Maltego `.mtgx` XML format,
entity ontology, and link wiring on every call. maltego-mcp encodes that once:
the lookups return normalized fields, and the graph tools emit a valid `.mtgx`
that opens cleanly in Maltego Desktop. The expanders bundle the common pivots
(IP to ASN to netblock, domain to whois to DNS to ASN) into one call so the
agent does not re-derive them each time.

## What maltego-mcp is not

- **Not a Maltego replacement.** It produces `.mtgx` files; you still open and
  drive them in Maltego Graph Desktop.
- **Not a threat-intel platform.** It does not embed MISP, TheHive, Cortex, or
  VirusTotal clients. It composes with the dedicated MCPs for those.
- **Not a paid-connector bypass.** Live transform results are still bound by your
  Maltego plan and connector limits.
- **Not a bulk scanner.** The lookups are primitive, single-target enrichments
  meant to build a graph, not a high-volume reconnaissance engine.

## Development

```bash
npm test                # Phase A unit tests (vitest)
npm run test:integration
npm run test:all
npm run typecheck
npm run test:transforms # Phase B pytest suite
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for what lands easily, [SECURITY.md](SECURITY.md) for how to report a vulnerability privately, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
