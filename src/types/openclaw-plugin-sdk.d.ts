declare module "openclaw/plugin-sdk/plugin-entry" {
  export interface PluginEntryApi {
    registrationMode: "full" | "discovery";
    pluginConfig: Record<string, unknown>;
    registerTool(tool: AnyAgentTool): void;
  }
  export interface PluginEntryDef {
    id: string;
    name: string;
    description: string;
    register(api: PluginEntryApi): void;
  }
  export type AnyAgentTool = {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    execute(toolCallId: string, raw: Record<string, unknown>): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: unknown;
    }>;
  };
  export function definePluginEntry(def: PluginEntryDef): PluginEntryDef;
}
