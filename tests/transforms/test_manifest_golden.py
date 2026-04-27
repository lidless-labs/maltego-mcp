"""Lock in maltego-trx's manifest XML output. Catches surprise format drift."""

from __future__ import annotations

import re
from pathlib import Path
from xml.etree.ElementTree import tostring

from maltego_trx.mtz import create_local_server_xml, create_transform_xml

GOLDEN_DIR = Path(__file__).parent / "golden"
LASTSYNC_RE = re.compile(r"<LastSync>[^<]*</LastSync>")


def _normalize(xml: str) -> str:
    return LASTSYNC_RE.sub("<LastSync>__IGNORE__</LastSync>", xml).strip()


def test_local_server_xml_matches_golden() -> None:
    actual = tostring(create_local_server_xml(["misp_event_pivot"]), encoding="unicode")
    expected = (GOLDEN_DIR / "expected_local_server.xml").read_text(encoding="utf-8")
    assert _normalize(actual) == _normalize(expected)


def test_transform_xml_matches_golden() -> None:
    actual = tostring(
        create_transform_xml(
            "misp_event_pivot",
            "MISP - events containing IOC",
            "Find MISP events whose attributes contain the input value.",
            "maltego.IPv4Address",
            "Solomon Neas <srneas@gmail.com>",
        ),
        encoding="unicode",
    )
    expected = (GOLDEN_DIR / "expected_transform.xml").read_text(encoding="utf-8")
    assert _normalize(actual) == _normalize(expected)
