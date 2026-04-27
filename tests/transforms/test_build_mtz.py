"""Build script produces an importable .mtz with the maltego-trx layout."""

from __future__ import annotations

import zipfile
from pathlib import Path

from scripts.build_mtz import build_mtz


def test_build_produces_expected_zip_layout(tmp_path: Path) -> None:
    out = tmp_path / "test.mtz"
    build_mtz(output_path=out)
    assert out.exists()
    assert out.stat().st_size > 0
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
    assert "Servers/Local.tas" in names


def test_build_passes_entropy_scan(tmp_path: Path) -> None:
    out = tmp_path / "test.mtz"
    build_mtz(output_path=out)  # should not raise EntropyError
