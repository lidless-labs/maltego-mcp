<p align="center">
  <img src="docs/assets/maltego-mcp-banner.jpg" alt="Watercolor transform pivot map for maltego-mcp" width="100%" />
</p>

<h1 align="center">maltego-mcp</h1>

<p align="center">
  <a href="https://github.com/solomonneas/maltego-mcp/releases/latest"><img src="https://img.shields.io/github/v/release/solomonneas/maltego-mcp?style=flat-square&label=release&color=2563eb" alt="latest release" /></a>
  <a href="https://www.npmjs.com/package/maltego-mcp"><img src="https://img.shields.io/npm/v/maltego-mcp?style=flat-square&logo=npm&color=cb3837" alt="npm version" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.3-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.3" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 20+" /></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP%20SDK-1.0-6f42c1?style=flat-square" alt="MCP SDK 1.0" /></a>
  <a href="https://www.maltego.com/products/maltego-graph/"><img src="https://img.shields.io/badge/Maltego-Graph%20Desktop-f59e0b?style=flat-square" alt="Maltego Graph Desktop" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT license" /></a>
</p>

Two cooperating layers for Maltego Desktop:

- **Phase A (TypeScript MCP server):** lets an LLM author Maltego `.mtgx` graph files and run primitive OSINT lookups (whois / DNS / ASN / crt.sh). Graphs land on disk and you open them in Maltego Desktop.
- **Phase B (Python TRX transforms in a `.mtz`):** adds right-click pivots into MISP, TheHive, Cortex, and the bundled MITRE ATT&CK dataset directly inside Maltego Desktop. See [`transforms/README.md`](transforms/README.md).

The two phases share the repo, nothing else. Either layer can be uninstalled without breaking the other.

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

## Tools (Phase A)

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

### Entity types

Standard Maltego ontology: `IPv4Address`, `IPv6Address`, `Domain`, `URL`, `Hash`, `EmailAddress`, `Netblock`, `AS`, `Website`, `Company`, `Person`. For concepts without a standard type, use `Phrase` with a category prefix (`[T1566] Phishing`, `[TheHive] Case #42`).

### Composing with other MCPs

maltego-mcp does not embed third-party threat-intel clients. For MISP events, ATT&CK techniques, Cortex reports, etc., call the dedicated MCPs (`misp-mcp`, `mitre-mcp`, `cortex-mcp`, etc.) and pipe results into `maltego_add_entity` / `maltego_add_link`. Or, for in-Maltego pivots, install Phase B (below).

## Install

```bash
npm install -g maltego-mcp
```

Or from source (required for Phase B transforms):

```bash
git clone https://github.com/solomonneas/maltego-mcp.git
cd maltego-mcp
npm install
npm run build
```

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

## Configuration

Both env vars are optional.

| Variable | Default | Description |
|---|---|---|
| `MALTEGO_MCP_OUTPUT_DIR` | `~/MaltegoGraphs` | Default output directory for `.mtgx` files |
| `MALTEGO_MCP_LOOKUP_TIMEOUT_MS` | `30000` | Per-lookup timeout in ms (currently applied to `crt.sh` only; `whois`, `dns`, `asn` use library defaults) |

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
      "args": ["/absolute/path/to/maltego-mcp/dist/mcp-server.js"]
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
claude mcp add maltego -- node /absolute/path/to/maltego-mcp/dist/mcp-server.js
```

Add `--scope user` to make it available from any directory instead of only the current project.

### OpenClaw

**Recommended: install as an OpenClaw plugin via ClawHub.**

```bash
openclaw plugins install clawhub:maltego
systemctl --user restart openclaw-gateway
openclaw plugins list   # confirm "maltego" is registered
```

This installs the same package as a native OpenClaw plugin — tool calls go through the plugin SDK directly instead of spawning a separate stdio MCP process. Configure `outputDir` and `lookupTimeoutMs` in OpenClaw's plugin config UI or via the JSON config file.

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
  "args": ["/absolute/path/to/maltego-mcp/dist/mcp-server.js"]
}'
```

Then restart the OpenClaw gateway so the new server is picked up:

```bash
systemctl --user restart openclaw-gateway
openclaw mcp list   # confirm "maltego" is registered
```

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
    args: ["/absolute/path/to/maltego-mcp/dist/mcp-server.js"]
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
codex mcp add maltego -- node /absolute/path/to/maltego-mcp/dist/mcp-server.js
```

Codex writes the entry to `~/.codex/config.toml` under `[mcp_servers.maltego]`. Verify with:

```bash
codex mcp list
```

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

## Development

```bash
npm test                # Phase A unit tests (vitest)
npm run test:integration
npm run test:all
npm run typecheck
npm run test:transforms # Phase B pytest suite
```

## License

[MIT](LICENSE)
