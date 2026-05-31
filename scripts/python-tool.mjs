#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";
const venvPython = isWindows
  ? join(repoRoot, "transforms", ".venv", "Scripts", "python.exe")
  : join(repoRoot, "transforms", ".venv", "bin", "python");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
  return process.exitCode;
}

function systemPython() {
  if (isWindows) {
    const py = spawnSync("py", ["-3", "-c", "import sys; print(sys.executable)"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (py.status === 0 && py.stdout.trim()) {
      return { command: "py", argsPrefix: ["-3"] };
    }
  }

  for (const command of ["python3", "python"]) {
    const probe = spawnSync(command, ["-c", "import sys; print(sys.version_info[0])"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (probe.status === 0 && probe.stdout.trim() === "3") {
      return { command, argsPrefix: [] };
    }
  }

  throw new Error("Python 3 was not found on PATH");
}

function requireVenv() {
  if (!existsSync(venvPython)) {
    throw new Error(`missing transform venv at ${venvPython}; run npm run setup:transforms first`);
  }
}

const action = process.argv[2];

try {
  if (action === "setup") {
    const py = systemPython();
    run(py.command, [...py.argsPrefix, "scripts/setup_venv.py"]);
  } else if (action === "test") {
    requireVenv();
    run(venvPython, ["-m", "pytest", "tests/transforms"]);
  } else if (action === "build-mtz") {
    requireVenv();
    run(venvPython, ["scripts/build_mtz.py"]);
  } else {
    console.error("usage: node scripts/python-tool.mjs <setup|test|build-mtz>");
    process.exitCode = 2;
  }
} catch (err) {
  console.error((err instanceof Error) ? err.message : String(err));
  process.exitCode = 1;
}
