"""TRX helpers: phrase prefix builders, entity-type constants, escaping."""

from __future__ import annotations

from transforms.shared.trx import (
    ENTITY_TYPES,
    attack_technique_phrase,
    cortex_verdict_phrase,
    misp_event_phrase,
    safe_phrase_value,
    thehive_case_phrase,
)


def test_entity_type_constants_match_phase_a_ontology() -> None:
    assert ENTITY_TYPES["IPv4"] == "maltego.IPv4Address"
    assert ENTITY_TYPES["IPv6"] == "maltego.IPv6Address"
    assert ENTITY_TYPES["Domain"] == "maltego.Domain"
    assert ENTITY_TYPES["URL"] == "maltego.URL"
    assert ENTITY_TYPES["Hash"] == "maltego.Hash"
    assert ENTITY_TYPES["Email"] == "maltego.EmailAddress"
    assert ENTITY_TYPES["Netblock"] == "maltego.Netblock"
    assert ENTITY_TYPES["AS"] == "maltego.AS"
    assert ENTITY_TYPES["Phrase"] == "maltego.Phrase"


def test_misp_event_phrase_format() -> None:
    assert misp_event_phrase(1337) == "[MISP] Event #1337"


def test_thehive_case_phrase_format() -> None:
    assert thehive_case_phrase("CASE-42") == "[TheHive] Case #CASE-42"


def test_cortex_verdict_phrase_format() -> None:
    assert (
        cortex_verdict_phrase("VirusTotal_GetReport_3_1", "malicious")
        == "[Cortex] VirusTotal_GetReport_3_1: malicious"
    )


def test_attack_technique_phrase_format() -> None:
    assert attack_technique_phrase("T1566.001", "Spearphishing Attachment") == (
        "[T1566.001] Spearphishing Attachment"
    )


def test_safe_phrase_value_strips_xml_breakers() -> None:
    raw = 'evil<script>"drop"</script>'
    out = safe_phrase_value(raw)
    assert "<" not in out
    assert ">" not in out
    assert '"' not in out
