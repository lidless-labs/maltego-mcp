"""attack_technique_pivot: [T<id>] Phrase -> related sub-techniques + tactics."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from maltego_trx.maltego import MaltegoTransform

from transforms.discoverable import AttackTechniquePivot as mod
from transforms.discoverable.AttackTechniquePivot import AttackTechniquePivot

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def patch_dataset(monkeypatch: pytest.MonkeyPatch) -> None:
    data = json.loads((FIXTURES / "attack_subset.json").read_text())
    monkeypatch.setattr(mod, "_DATASET", data, raising=False)


def _request(value: str):
    return SimpleNamespace(Value=value, Type="maltego.Phrase", Properties={})


def test_parent_technique_emits_subtechniques_and_tactic() -> None:
    resp = MaltegoTransform()
    AttackTechniquePivot.create_entities(_request("[T1566] Phishing"), resp)

    values = [e.value for e in resp.entities]
    assert "[T1566.001] Spearphishing Attachment" in values
    assert any(v.startswith("[Tactic] Initial Access") for v in values)


def test_subtechnique_emits_parent_and_tactic() -> None:
    resp = MaltegoTransform()
    AttackTechniquePivot.create_entities(
        _request("[T1566.001] Spearphishing Attachment"), resp
    )

    values = [e.value for e in resp.entities]
    assert "[T1566] Phishing" in values
    assert any(v.startswith("[Tactic]") for v in values)


def test_unknown_technique_emits_inform() -> None:
    resp = MaltegoTransform()
    AttackTechniquePivot.create_entities(_request("[T9999] Made Up"), resp)
    assert resp.entities == []
    assert any("not in dataset" in m[1].lower() for m in resp.UIMessages)
