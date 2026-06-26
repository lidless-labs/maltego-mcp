# Security Policy

## Supported versions

maltego-mcp is pre-1.0 and moves fast. Only the latest released tag on the `main` branch receives security fixes. Pin to a released version if you need a known-good build.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Email **srneas@gmail.com** with: <!-- content-guard: allow pii/email -->

- A short description of the issue.
- Steps to reproduce (or a minimal proof of concept).
- The version or commit you tested against.
- Whether you would like to be credited in the release notes.

You should get an acknowledgment within 72 hours. If you do not, please follow up - the mail may have been filtered.

## In scope

- Path traversal, symlink-attack, or arbitrary-write flaws in the graph save/load tools (`maltego_save_graph`, `maltego_load_graph`) or the expanders that write `.mtgx` files.
- Server-side request forgery or unsafe parsing in the OSINT lookup tools (`maltego_whois`, `maltego_dns`, `maltego_asn`, `maltego_crtsh`).
- XML-injection or entity-expansion flaws when authoring or parsing `.mtgx` graphs.
- Phase B transform code that writes outside its expected directories or executes attacker-controlled input on the Maltego host.

## Out of scope

- Bugs in Maltego Desktop, the `maltego-trx` library, or third-party MCP servers - report those to their respective projects.
- Bugs in OpenClaw, Claude Desktop, Claude Code, Hermes, or Codex - report those to their respective projects.
- Issues that require an attacker to already have write access to the user's machine, MCP client config, or npm account.
- Rate-limit or availability issues with upstream OSINT data sources (whois servers, crt.sh, Team Cymru).

## A note on the lookup tools

The lookup tools reach out to public OSINT data sources over the network. Treat any value returned by `maltego_whois`, `maltego_dns`, `maltego_asn`, or `maltego_crtsh` as untrusted external input. The tools normalize and validate what they parse, but you should not feed raw lookup output into a shell, a query, or another tool without your own validation.

## Disclosure

We aim to ship a fix within 14 days of confirming a valid report. A coordinated disclosure timeline can be negotiated for issues that need longer.
