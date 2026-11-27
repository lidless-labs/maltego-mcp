# Changelog

## [Unreleased]

## 0.4.4

### Added

- Maintainer-health docs: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub issue forms (`bug`, `feature`, `config`), and a pull-request template with a no-PII / content-guard checkbox.

### Changed

- README overhaul: differentiator on the first screen, a Website link, a keyword-rich "What it does" section, a copy-paste MCP quickstart, a verified 13-tool reference, "Why not" comparisons, and a "What maltego-mcp is not" section.

### Fixed

- Keep IOC graph handles independent, including when a save fails. Preserve separate MISP and TheHive records that share a title.
- Preserve leading zeros, decimal formatting, and surrounding whitespace in MTGX values, properties, and link labels.
- Return lookup errors for malformed crt.sh responses and cap response bytes, certificate records, and alternate names.
- Preserve the `maltegoctl` and `maltegoctrl` executable entrypoints and include transform sources in the npm package. Generated MTGX and machine-specific MTZ files stay out of the tarball.
- Bound MTGX archive reads, streamed extraction, XML structure, graph growth, and concurrent imports.
- Publish graph files atomically through pinned parent directories on Linux. Enforce the save tool's no-overwrite flag at publication and fail closed on platforms without the required filesystem support.
- Label public WHOIS output as untrusted data, escape marker delimiters, and bound response text.
- Update compatible dependencies to clear npm advisories and pin executable CI actions to commit SHAs.

- Start exactly one stdio server from the bundled `maltego-mcp` and `maltegoctl mcp` entrypoints so graph handles persist across requests. Report the package version in the MCP handshake and ready message.
- Emit Maltego-compatible `.mtgx` GraphML with native entity and link keys, renderers, standard entity value properties, and manual-link metadata. Continue reading graphs written by earlier releases.

## 0.4.0 - 2026-05-31

### Added

- Added `maltego_build_ioc_graph` for building a single `.mtgx` investigation graph from one IOC plus enrichment summaries gathered from MISP, TheHive, Cortex, MITRE ATT&CK, or other MCPs.
- Added a Basic-friendly no-network demo workflow: `npm run demo:basic`.
- Added GitHub Actions CI for TypeScript typecheck, full Vitest suite, build, demo graph generation, transform pytest suite, and `.mtz` package generation.
- Added cross-platform transform helper commands for setup, tests, and `.mtz` builds.

### Fixed

- Kept `undici` on a Node 20 compatible version so the documented `Node.js 20+` runtime remains valid.
- Fixed POSIX transform config-dir test expectations.

## 0.3.0 - 2026-05-02

- Published the dual MCP server and OpenClaw plugin entry build.
