"""Bundle transforms/ into dist/maltego-mcp-transforms.mtz.

Idempotent. Re-runs cleanly. Refuses to ship if the entropy scan finds
likely secrets in the bundled XML.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Make the repo root importable so `transforms.extensions` and
# `transforms.transforms` resolve when this script is run with `py -3`.
sys.path.insert(0, str(REPO_ROOT))
# And add the transforms/.venv site-packages so maltego_trx is importable.
if sys.platform == "win32":
    SITE = REPO_ROOT / "transforms" / ".venv" / "Lib" / "site-packages"
else:
    py_dirs = sorted(
        (REPO_ROOT / "transforms" / ".venv" / "lib").glob("python*/site-packages")
    )
    SITE = py_dirs[0] if py_dirs else REPO_ROOT
sys.path.insert(0, str(SITE))

from maltego_trx.registry import register_transform_classes  # noqa: E402

from scripts.check_entropy import scan_zip  # noqa: E402
from transforms import discoverable as transform_pkg  # noqa: E402
from transforms.extensions import registry  # noqa: E402


def venv_python() -> Path:
    if sys.platform == "win32":
        return REPO_ROOT / "transforms" / ".venv" / "Scripts" / "python.exe"
    return REPO_ROOT / "transforms" / ".venv" / "bin" / "python"


def build_mtz(output_path: Path | None = None) -> Path:
    register_transform_classes(transform_pkg)

    out = output_path or REPO_ROOT / "dist" / "maltego-mcp-transforms.mtz"
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()

    py = venv_python()
    if not py.exists():
        raise RuntimeError(
            f"transforms/.venv not found at {py}; run `npm run setup:transforms` first"
        )

    registry.write_local_mtz(
        mtz_path=str(out),
        working_dir=str(REPO_ROOT / "transforms"),
        command=str(py),
        params="project.py",
        debug=True,
    )

    scan_zip(out)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    out = build_mtz(args.output)
    print(f"\nbuilt: {out}\nimport this file in Maltego: Import -> Configuration -> {out}")


if __name__ == "__main__":
    main()
