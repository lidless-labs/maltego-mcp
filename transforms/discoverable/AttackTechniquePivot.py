"""Transform: [T<id>] Phrase -> related sub-techniques + parent + tactics.

Uses a bundled, reduced MITRE ATT&CK dataset (no network call). The dataset
ships in transforms/data/attack_techniques.json and is loaded once per process.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from maltego_trx.entities import Phrase
from maltego_trx.transform import DiscoverableTransform

from transforms.extensions import MCP_TRANSFORM_SET, registry
from transforms.shared.trx import attack_technique_phrase

log = logging.getLogger("transforms.attack_technique_pivot")

TECHNIQUE_ID_RE = re.compile(r"\[(T\d{4}(?:\.\d{3})?)\]")
DATASET_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "attack_techniques.json"
)
_DATASET: dict | None = None


def _load() -> dict:
    global _DATASET
    if _DATASET is None:
        _DATASET = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    return _DATASET


@registry.register_transform(
    display_name="ATT&CK - related techniques and tactics",
    input_entity="maltego.Phrase",
    description="For a [T<id>] Phrase, return parent/sub techniques and tactics.",
    output_entities=["maltego.Phrase"],
    transform_set=MCP_TRANSFORM_SET,
)
class AttackTechniquePivot(DiscoverableTransform):
    @classmethod
    def create_entities(cls, request, response) -> None:
        m = TECHNIQUE_ID_RE.search(request.Value)
        if not m:
            response.addUIMessage(
                "input does not look like '[T<id>]'; cannot extract technique id",
                "Inform",
            )
            return
        tid = m.group(1)

        data = _load()["techniques"]
        meta = data.get(tid)
        if meta is None:
            response.addUIMessage(f"technique {tid} not in dataset", "Inform")
            return

        for sub in meta.get("subtechniques", []):
            sub_meta = data.get(sub, {})
            response.addEntity(
                Phrase, attack_technique_phrase(sub, sub_meta.get("name", ""))
            )

        parent = meta.get("parent")
        if parent and parent in data:
            response.addEntity(
                Phrase, attack_technique_phrase(parent, data[parent].get("name", ""))
            )

        for tactic in meta.get("tactics", []):
            response.addEntity(Phrase, f"[Tactic] {tactic}")
