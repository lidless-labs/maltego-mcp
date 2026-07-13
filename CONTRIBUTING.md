# Contributing to maltego-mcp

maltego-mcp is an MCP server for authoring Maltego graph files and running primitive OSINT lookups, plus an optional Python transform layer for in-Maltego pivots. Patches are welcome. Before you start, please skim this file so we both spend our time on the right things.

## What kinds of changes land easily

- **Bug fixes** in the graph tools, the OSINT lookups, the `.mtgx` writer/parser, or the Phase B transforms.
- **New entity mappings or ontology coverage** that follows the standard Maltego ontology.
- **Lookup robustness**: better timeout handling, clearer error normalization, more resilient parsing of upstream OSINT responses.
- **Docs**: clearer setup recipes for MCP clients, corrections to the tool reference.
- **Test coverage** for any of the above.

## What needs a conversation first

- **A new MCP tool.** Open an issue first describing the user story. Tool names are a public surface and renaming them later is painful.
- **Breaking changes** to existing tool input shapes, the `.mtgx` output format, or the transform manifest layout.
- **Anything that embeds a third-party threat-intel client** (MISP, TheHive, Cortex, VirusTotal, and so on). maltego-mcp composes with the dedicated MCPs for those on purpose - it does not bundle them.
- **New runtime dependencies.** The Phase A dependency set is deliberately small; adding to it needs a reason.

## What does not land

- Personal details, hostnames, private IPs, account IDs, or live credentials in code, tests, fixtures, or demo graphs. Demo and test data must use documentation-safe ranges (RFC 5737 such as `203.0.113.0/24`, `example.com`, `example.invalid`).
- Live network calls baked into unit tests. Lookups are mocked at the unit level; live calls belong in the integration suite.
- AI-co-authorship trailers on commits (`Co-Authored-By: <model>`). Conventional commits only.

## Local dev

Phase A (TypeScript MCP server):

```bash
git clone https://github.com/lidless-labs/maltego-mcp.git
cd maltego-mcp
npm install
npm run build
npm test                # unit tests
npm run typecheck
```

Phase B (Python transforms), from a source checkout on a host with Python 3.11+:

```bash
npm run setup:transforms   # creates transforms/.venv with maltego-trx pinned
npm run test:transforms    # pytest suite
npm run build:mtz          # writes dist/maltego-mcp-transforms.mtz
```

The full test matrix mirrors CI:

```bash
npm run test:all           # unit + integration
npm run test:transforms
```

## Adding an MCP tool

Tools live under `src/tools/`. To add one:

1. Create `src/tools/<name>.ts` exporting a tool factory and a `mcpInputShape` (zod).
2. Register both in `src/tools/index.ts` (`ALL_TOOL_FACTORIES` and `MCP_INPUT_SHAPES`).
3. Add unit tests under `tests/unit/`.
4. Document the tool in the `Tools (Phase A)` section of `README.md` and bump the tool count noted there.
5. Add a `## [Unreleased]` entry to `CHANGELOG.md` describing the user-visible effect.

Keep tool names in the `maltego_*` namespace and return typed results.

## Filing issues

Please use the templates under `.github/ISSUE_TEMPLATE/`. They exist to save you from re-typing the version, MCP client, and OS every time. Before posting any output, remove tokens, private hostnames, private IPs, and unredacted absolute paths.

## License

By contributing you agree that your contribution is licensed under the MIT License, same as the rest of the repo.
