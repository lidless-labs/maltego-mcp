"""Build-time entropy scan refuses to ship a .mtz containing likely secrets."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from scripts.check_entropy import EntropyError, scan_zip


def _make_zip(path: Path, entries: dict[str, str]) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)


def test_clean_zip_passes(tmp_path: Path) -> None:
    z = tmp_path / "clean.mtz"
    _make_zip(z, {"Servers/Local.tas": "<MaltegoServer name='Local'/>"})
    scan_zip(z)


def test_high_entropy_string_blocks_build(tmp_path: Path) -> None:
    z = tmp_path / "leaky.mtz"
    secret = "AKIAIOSFODNN7EXAMPLE0K1q3vJALrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    _make_zip(z, {"TransformRepositories/Local/x.transform": f"<x key='{secret}'/>"})
    with pytest.raises(EntropyError, match="entropy"):
        scan_zip(z)


def test_force_env_var_overrides(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    z = tmp_path / "leaky.mtz"
    secret = "AKIAIOSFODNN7EXAMPLE0K1q3vJALrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    _make_zip(z, {"TransformRepositories/Local/x.transform": f"<x key='{secret}'/>"})
    monkeypatch.setenv("MALTEGO_MCP_BUILD_FORCE", "1")
    scan_zip(z)
