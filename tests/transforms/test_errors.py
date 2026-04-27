"""Errors map cleanly onto TRX UIMessage categories without sys.exit(1)."""

from __future__ import annotations

from transforms.shared.errors import (
    AuthError,
    BackendError,
    ConfigMissingError,
    RateLimitError,
    classify_for_uimessage,
)


def test_config_missing_returns_inform_with_env_var_hint() -> None:
    err = ConfigMissingError("set MISP_API_KEY")
    cat, msg = classify_for_uimessage(err)
    assert cat == "Inform"
    assert "MISP_API_KEY" in msg


def test_auth_error_returns_partial() -> None:
    err = AuthError("401 from MISP")
    cat, _ = classify_for_uimessage(err)
    assert cat == "PartialError"


def test_rate_limit_returns_partial_with_retry_hint() -> None:
    err = RateLimitError("429 retry-after 60")
    cat, msg = classify_for_uimessage(err)
    assert cat == "PartialError"
    assert "retry" in msg.lower()


def test_backend_error_returns_partial() -> None:
    err = BackendError("MISP returned 500")
    cat, _ = classify_for_uimessage(err)
    assert cat == "PartialError"
