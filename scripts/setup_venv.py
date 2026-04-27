"""Create transforms/.venv and install runtime + dev requirements.

Idempotent: re-running upgrades pip and reinstalls requirements.
"""

from __future__ import annotations

import subprocess
import sys
import venv
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    venv_dir = repo_root / "transforms" / ".venv"
    req_runtime = repo_root / "transforms" / "requirements.txt"
    req_dev = repo_root / "transforms" / "requirements-dev.txt"

    if not venv_dir.exists():
        print(f"creating venv at {venv_dir}")
        venv.create(str(venv_dir), with_pip=True, clear=False)
    else:
        print(f"venv already exists at {venv_dir}")

    if sys.platform == "win32":
        py = venv_dir / "Scripts" / "python.exe"
    else:
        py = venv_dir / "bin" / "python"

    subprocess.check_call([str(py), "-m", "pip", "install", "--upgrade", "pip"])
    subprocess.check_call([str(py), "-m", "pip", "install", "-r", str(req_runtime)])
    subprocess.check_call([str(py), "-m", "pip", "install", "-r", str(req_dev)])

    print(f"\nReady. Interpreter: {py}")


if __name__ == "__main__":
    main()
