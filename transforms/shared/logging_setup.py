"""Configure dual sink (stderr + rotating file) for transform runs."""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler

from .config import default_config_dir


def configure(transform_name: str, level: int = logging.INFO) -> logging.Logger:
    """Idempotent. Safe to call from every transform's entry point."""
    log_dir = default_config_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{transform_name}.log"

    root = logging.getLogger("transforms")
    if any(getattr(h, "_maltego_mcp", False) for h in root.handlers):
        return root  # already configured this process

    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(fmt)
    stderr_handler._maltego_mcp = True  # type: ignore[attr-defined]
    root.addHandler(stderr_handler)

    file_handler = RotatingFileHandler(
        str(log_file), maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    file_handler._maltego_mcp = True  # type: ignore[attr-defined]
    root.addHandler(file_handler)

    root.setLevel(level)
    return root
