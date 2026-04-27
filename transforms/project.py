"""Entry point invoked by Maltego for every local transform.

Maltego runs `<python> project.py local <transform_name>` per the command line
baked into each .transformsettings by maltego-trx. The trailing positional arg
selects which DiscoverableTransform subclass handles the request.
"""

from __future__ import annotations

import sys
from pathlib import Path

# When Maltego invokes this script directly (not via `python -m`), the package
# is not importable by name. Add the repo root to sys.path so
# `transforms.extensions` and `transforms.transforms` resolve.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from maltego_trx.handler import handle_run  # noqa: E402
from maltego_trx.registry import register_transform_classes  # noqa: E402

from transforms import transforms as transform_pkg  # noqa: E402
from transforms.extensions import registry  # noqa: F401, E402  -- side-effect: registry config

register_transform_classes(transform_pkg)

if __name__ == "__main__":
    handle_run(__name__, sys.argv, application=None)
