"""misp_event_to_iocs: Phrase[MISP] Event #N -> typed entities per attribute."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import responses
from maltego_trx.maltego import MaltegoTransform

from transforms.discoverable.MispEventToIocs import MispEventToIocs

FIXTURES = Path(__file__).parent / "fixtures"


def _request(value: str):
    return SimpleNamespace(Value=value, Type="maltego.Phrase", Properties={})


def test_emits_typed_entity_per_attribute(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    body = json.loads((FIXTURES / "misp_event_get_response.json").read_text())
    mocked_responses.get("https://misp.test/events/1337", json=body, status=200)

    resp = MaltegoTransform()
    MispEventToIocs.create_entities(_request("[MISP] Event #1337"), resp)

    pairs = {(e.entityType, e.value) for e in resp.entities}
    assert ("maltego.IPv4Address", "1.2.3.4") in pairs
    assert ("maltego.Domain", "evil.example") in pairs
    assert ("maltego.URL", "http://evil.example/c2") in pairs
    assert ("maltego.Hash", "d41d8cd98f00b204e9800998ecf8427e") in pairs
    assert ("maltego.EmailAddress", "ops@evil.example") in pairs
    # Unmapped MISP types (btc) get surfaced as Phrase, not dropped silently
    assert any(t == "maltego.Phrase" for t, _ in pairs)


def test_rejects_non_misp_phrase(fake_config: Path) -> None:
    resp = MaltegoTransform()
    MispEventToIocs.create_entities(_request("not a misp event reference"), resp)
    assert resp.entities == []
    assert any("event id" in m[1].lower() for m in resp.UIMessages)
