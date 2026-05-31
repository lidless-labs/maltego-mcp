# Changelog

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
