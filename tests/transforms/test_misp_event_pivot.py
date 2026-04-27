"""misp_event_pivot: IPv4/Domain/Hash/Email -> Phrase[MISP] Event #N entities."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import responses
from maltego_trx.maltego import MaltegoTransform

from transforms.discoverable.MispEventPivot import MispEventPivot

FIXTURES = Path(__file__).parent / "fixtures"


def _request(value: str, entity_type: str = "maltego.IPv4Address"):
    return SimpleNamespace(Value=value, Type=entity_type, Properties={})


def test_emits_one_phrase_per_unique_event(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    body = json.loads((FIXTURES / "misp_attributes_response.json").read_text())
    mocked_responses.post("https://misp.test/attributes/restSearch", json=body, status=200)

    response = MaltegoTransform()
    MispEventPivot.create_entities(_request("1.2.3.4"), response)

    values = [e.value for e in response.entities]
    assert "[MISP] Event #1337" in values
    assert "[MISP] Event #1338" in values
    assert len(values) == 2  # de-duplicated by event id
    for e in response.entities:
        assert e.entityType == "maltego.Phrase"


def test_emits_inform_when_no_attributes_found(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    mocked_responses.post(
        "https://misp.test/attributes/restSearch",
        json={"response": {"Attribute": []}},
        status=200,
    )
    response = MaltegoTransform()
    MispEventPivot.create_entities(_request("nothing.example", "maltego.Domain"), response)

    assert response.entities == []
    assert any("no misp events" in m[1].lower() for m in response.UIMessages)


def test_emits_inform_on_missing_api_key(
    fake_config: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MISP_API_KEY", raising=False)
    response = MaltegoTransform()
    MispEventPivot.create_entities(_request("1.2.3.4"), response)
    assert response.entities == []
    assert any("MISP_API_KEY" in m[1] for m in response.UIMessages)


def test_emits_partial_on_backend_403(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    mocked_responses.post(
        "https://misp.test/attributes/restSearch",
        json={"errors": ["denied"]},
        status=403,
    )
    response = MaltegoTransform()
    MispEventPivot.create_entities(_request("1.2.3.4"), response)
    assert response.entities == []
    assert any(m[0] == "PartialError" for m in response.UIMessages)
