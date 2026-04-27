"""Reduce STIX bundle to {techniques: {id: {name, tactics, subtechniques?, parent?}}}."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    bundle = json.loads(src.read_text(encoding="utf-8"))
    techniques: dict[str, dict] = {}
    parent_of: dict[str, list[str]] = {}
    for obj in bundle.get("objects", []):
        if obj.get("type") != "attack-pattern":
            continue
        ext = next(
            (
                r
                for r in obj.get("external_references", [])
                if r.get("source_name") == "mitre-attack"
            ),
            None,
        )
        if not ext:
            continue
        tid = ext["external_id"]
        tactics = [
            kc["phase_name"].title()
            for kc in obj.get("kill_chain_phases", [])
            if kc.get("kill_chain_name") == "mitre-attack"
        ]
        techniques[tid] = {
            "name": obj.get("name", ""),
            "tactics": tactics,
        }
        if obj.get("x_mitre_is_subtechnique"):
            parent_id = tid.split(".")[0]
            techniques[tid]["parent"] = parent_id
            parent_of.setdefault(parent_id, []).append(tid)
    for parent_id, subs in parent_of.items():
        if parent_id in techniques:
            techniques[parent_id]["subtechniques"] = sorted(subs)
    dst.write_text(
        json.dumps({"techniques": techniques}, indent=2), encoding="utf-8"
    )
    print(f"reduced {len(techniques)} techniques to {dst}")


if __name__ == "__main__":
    main()
