import { homedir } from "node:os";
import { join } from "node:path";

export interface MaltegoConfig {
  outputDir: string;
  lookupTimeoutMs: number;
}

export interface ResolveOpts {
  pluginConfig?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function resolveConfig(opts: ResolveOpts): MaltegoConfig {
  const env = opts.env ?? {};
  const pc = opts.pluginConfig ?? {};

  const pcOutputDir = typeof pc.outputDir === "string" && pc.outputDir.length > 0
    ? pc.outputDir
    : undefined;
  const pcTimeout = typeof pc.lookupTimeoutMs === "number" && pc.lookupTimeoutMs > 0
    ? pc.lookupTimeoutMs
    : undefined;

  const envTimeoutRaw = env.MALTEGO_MCP_LOOKUP_TIMEOUT_MS;
  const envTimeout = (() => {
    if (!envTimeoutRaw) return undefined;
    const n = Number.parseInt(envTimeoutRaw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  return {
    outputDir: pcOutputDir
      ?? env.MALTEGO_MCP_OUTPUT_DIR
      ?? join(homedir(), "MaltegoGraphs"),
    lookupTimeoutMs: pcTimeout ?? envTimeout ?? DEFAULT_TIMEOUT_MS,
  };
}
