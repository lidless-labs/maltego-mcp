import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { resolveConfig } from "./src/config.js";
import { GraphRegistry } from "./src/server/registry.js";
import { ALL_TOOL_FACTORIES } from "./src/tools/index.js";

export default definePluginEntry({
  id: "maltego",
  name: "Maltego",
  description:
    "Author Maltego .mtgx graph files and run primitive OSINT lookups (whois / DNS / ASN / crt.sh) from inside OpenClaw. Phase A only; Phase B in-Maltego transforms ship as a separate .mtz import.",
  register(api) {
    if (api.registrationMode !== "full") return;
    const config = resolveConfig({ pluginConfig: api.pluginConfig });
    const registry = new GraphRegistry();
    const deps = { registry, config };
    for (const factory of ALL_TOOL_FACTORIES) {
      api.registerTool(factory(deps) as AnyAgentTool);
    }
  },
});
