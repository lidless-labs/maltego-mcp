import { ToolValidationError } from "./errors.js";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, resolve, isAbsolute, relative } from "node:path";

export function resolveHomeTilde(path: string): string {
  if (!path.startsWith("~")) return path;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new ToolValidationError("cannot resolve '~': no HOME/USERPROFILE set");
  }
  return path.replace(/^~/, home);
}

export function rejectNullBytes(path: string): void {
  if (path.includes("\0")) {
    throw new ToolValidationError(`path contains NUL byte: ${path}`);
  }
}

function canonicalizePotentialPath(path: string): string {
  let existing = path;
  const missingSegments: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(basename(existing));
    existing = parent;
  }
  return resolve(realpathSync.native(existing), ...missingSegments);
}

/**
 * Confine a caller-supplied path to the configured output directory.
 * - Relative paths are resolved under outputDir.
 * - Absolute paths (including after ~ expansion) must be inside outputDir.
 * - Returns the canonicalized absolute path.
 * Throws ToolValidationError if the resolved path escapes outputDir.
 */
export function confineToOutputDir(userPath: string, outputDir: string): string {
  rejectNullBytes(userPath);
  const expanded = resolveHomeTilde(userPath);
  const absoluteTarget = isAbsolute(expanded)
    ? resolve(expanded)
    : resolve(outputDir, expanded);
  const absoluteBase = canonicalizePotentialPath(resolve(outputDir));
  const canonicalTarget = canonicalizePotentialPath(absoluteTarget);
  const rel = relative(absoluteBase, canonicalTarget);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ToolValidationError(
      `path '${userPath}' resolves outside the configured output directory (${absoluteBase}); ` +
        `set MALTEGO_MCP_OUTPUT_DIR to a parent of your target or use a path under the current output dir`
    );
  }
  return canonicalTarget;
}
