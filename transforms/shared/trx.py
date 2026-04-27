"""Helpers shared across all transforms: entity-type constants, phrase builders."""

from __future__ import annotations

ENTITY_TYPES: dict[str, str] = {
    "IPv4": "maltego.IPv4Address",
    "IPv6": "maltego.IPv6Address",
    "Domain": "maltego.Domain",
    "URL": "maltego.URL",
    "Hash": "maltego.Hash",
    "Email": "maltego.EmailAddress",
    "Netblock": "maltego.Netblock",
    "AS": "maltego.AS",
    "Phrase": "maltego.Phrase",
}


def misp_event_phrase(event_id: int) -> str:
    return f"[MISP] Event #{event_id}"


def thehive_case_phrase(case_id: str) -> str:
    return f"[TheHive] Case #{case_id}"


def cortex_verdict_phrase(analyzer: str, verdict: str) -> str:
    return f"[Cortex] {analyzer}: {verdict}"


def attack_technique_phrase(technique_id: str, name: str) -> str:
    return f"[{technique_id}] {name}"


def safe_phrase_value(raw: str) -> str:
    """Strip characters that break TRX XML output."""
    return (
        raw.replace("<", "")
        .replace(">", "")
        .replace('"', "'")
        .replace("\x00", "")
    )
