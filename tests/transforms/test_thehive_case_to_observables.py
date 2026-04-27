"""thehive_case_to_observables: Phrase[TheHive] Case #X -> typed entities."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import responses
from maltego_trx.maltego import MaltegoTransform

from transforms.discoverable.TheHiveCaseToObservables import TheHiveCaseToObservables

FIXTURES = Path(__file__).parent / "fixtures"


def _request(value: str):
    return SimpleNamespace(Value=value, Type="maltego.Phrase", Properties={})


def test_emits_typed_entity_per_observable(
    fake_config, mocked_responses: responses.RequestsMock
) -> None:
    body = json.loads((FIXTURES / "thehive_case_observables.json").read_text())
    mocked_responses.post("https://thehive.test/api/v1/query", json=body, status=200)

    resp = MaltegoTransform()
    TheHiveCaseToObservables.create_entities(_request("[TheHive] Case #CASE-42"), resp)

    types = {e.entityType for e in resp.entities}
    assert "maltego.IPv4Address" in types
    assert "maltego.Domain" in types
    assert "maltego.URL" in types
    assert "maltego.Hash" in types
    assert "maltego.EmailAddress" in types
    assert "maltego.Phrase" in types  # 'other' becomes Phrase


def test_rejects_non_thehive_phrase(fake_config) -> None:
    resp = MaltegoTransform()
    TheHiveCaseToObservables.create_entities(_request("not a thehive case reference"), resp)
    assert resp.entities == []
    assert any("case id" in m[1].lower() for m in resp.UIMessages)
