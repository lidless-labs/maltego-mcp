# maltego-mcp transforms (Phase B)

Python TRX transforms bundled into a `.mtz` that adds right-click pivots in
Maltego Desktop into MISP, TheHive, Cortex, and the bundled MITRE ATT&CK
dataset.

## One-time setup

```bash
npm run setup:transforms     # creates transforms/.venv with maltego-trx pinned
```

Configure backends. Create `%APPDATA%\maltego-mcp\config.toml` (Windows) or
`~/.maltego-mcp/config.toml` (POSIX):

```toml
[misp]
url = "https://misp.local"
api_key_env = "MISP_API_KEY"
verify_ssl = false

[thehive]
url = "https://thehive.local"
api_key_env = "THEHIVE_API_KEY"

[cortex]
url = "https://cortex.local"
api_key_env = "CORTEX_API_KEY"

[network]
timeout_s = 30
```

Set the corresponding env vars in the shell that launches Maltego:

```powershell
[Environment]::SetEnvironmentVariable("MISP_API_KEY", "<your key>", "User")
```

Restart Maltego after setting env vars.

## Build the .mtz

```bash
npm run build:mtz
```

Output: `dist/maltego-mcp-transforms.mtz`. The build bakes the absolute
path of `transforms/.venv` into the manifest, so the .mtz is tied to this
machine. Re-run `npm run build:mtz` if the repo moves.

## Import in Maltego

1. Open Maltego Desktop.
2. Top menu: Import -> Configuration.
3. Select `dist/maltego-mcp-transforms.mtz`.
4. Confirm overwrite if a previous version is installed.

The six transforms appear in the right-click menu under the `maltego-mcp`
transform set with the `[MCP]` display suffix.

## The six transforms

| Display name | Input entity | Output |
|---|---|---|
| MISP - events containing IOC [MCP] | IPv4 / Domain / Hash / EmailAddress | Phrase per matching event |
| MISP - attributes in event [MCP] | Phrase `[MISP] Event #N` | Typed entity per attribute |
| TheHive - cases containing observable [MCP] | IPv4 / Domain / Hash / EmailAddress | Phrase per matching case |
| TheHive - observables in case [MCP] | Phrase `[TheHive] Case #X` | Typed entity per observable |
| Cortex - analyze IOC [MCP] | IPv4 / Domain / Hash / EmailAddress | Phrase per analyzer verdict |
| ATT&CK - related techniques and tactics [MCP] | Phrase `[T<id>]` | Phrase per related technique / tactic |

## Logging

Logs go to two places:
- Maltego transform output panel (stderr, when debug=true is set in the `.transformsettings`; we ship `debug=true`).
- `%APPDATA%\maltego-mcp\logs\<transform>.log` (Windows) or `~/.maltego-mcp/logs/<transform>.log` (POSIX). Rotates at 5 MB, 3 backups.

API keys are never logged.

## Tests

```bash
npm run test:transforms
```

## Edition notes

Built and tested on Maltego Graph (Desktop) Basic 4.11.2. Local TRX import
is edition-agnostic. iTDS is not used (Pro/Enterprise only).

## Refreshing the bundled MITRE ATT&CK dataset

The `attack_technique_pivot` transform reads `transforms/data/attack_techniques.json`,
a reduced form of MITRE's STIX bundle. To refresh:

```bash
curl -L -o /tmp/enterprise-attack.json https://github.com/mitre/cti/raw/master/enterprise-attack/enterprise-attack.json
transforms/.venv/Scripts/python.exe scripts/reduce_attack_dataset.py /tmp/enterprise-attack.json transforms/data/attack_techniques.json
npm run build:mtz
```
