"""thehive_observable_to_cases: IOC -> Phrase[TheHive] Case #X for each match."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import responses
from maltego_trx.maltego import MaltegoTransform

from transforms.discoverable.TheHiveObservableToCases import TheHiveObservableToCases

FIXTURES = Path(__file__).parent / "fixtures"


def _request(value: str, entity_type: str = "maltego.IPv4Address"):
    return SimpleNamespace(Value=value, Type=entity_type, Properties={})


def test_emits_one_phrase_per_unique_case(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    body = json.loads((FIXTURES / "thehive_observable_search.json").read_text())
    mocked_responses.post("https://thehive.test/api/v1/query", json=body, status=200)
    resp = MaltegoTransform()
    TheHiveObservableToCases.create_entities(_request("1.2.3.4"), resp)

    values = [e.value for e in resp.entities]
    assert "[TheHive] Case #CASE-42" in values
    assert "[TheHive] Case #CASE-43" in values
    assert len(values) == 2


def test_emits_inform_on_no_matches(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    mocked_responses.post("https://thehive.test/api/v1/query", json=[], status=200)
    resp = MaltegoTransform()
    TheHiveObservableToCases.create_entities(_request("nothing.example", "maltego.Domain"), resp)
    assert resp.entities == []
    assert any("no thehive cases" in m[1].lower() for m in resp.UIMessages)
