"""Exercise the Maltego local dispatch entrypoint with the bundled ATT&CK data."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECT_PY = REPO_ROOT / "transforms" / "project.py"


def test_dispatch_runs_named_transform() -> None:
    proc = subprocess.run(
        [
            sys.executable,
            str(PROJECT_PY),
            "local",
            "AttackTechniquePivot",
            "[T1566.001] Spearphishing Attachment",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}\nstdout: {proc.stdout}"
    message = ElementTree.fromstring(proc.stdout)
    assert message.tag == "MaltegoMessage"
    response = message.find("MaltegoTransformResponseMessage")
    assert response is not None
    values = {entity.findtext("Value") for entity in response.findall("Entities/Entity")}
    assert {"[T1566] Phishing", "[Tactic] Initial-Access"} <= values
