"""Five-category error model surfaced to Maltego via TRX UIMessage."""

from __future__ import annotations


class ConfigMissingError(RuntimeError):
    """User has not set the env var named in config.toml."""


class AuthError(RuntimeError):
    """Backend returned 401/403."""


class RateLimitError(RuntimeError):
    """Backend returned 429."""


class BackendError(RuntimeError):
    """Anything else from the backend (5xx, malformed body, network)."""


def classify_for_uimessage(err: Exception) -> tuple[str, str]:
    """Map an exception to a (UIMessage type, displayable text) tuple.

    Type values match maltego_trx.maltego.UIM_TYPES.
    Returns 'Inform' for fixable user-side issues, 'PartialError' for
    backend issues that the user did not cause and can retry.
    """
    if isinstance(err, ConfigMissingError):
        return "Inform", str(err)
    if isinstance(err, RateLimitError):
        return "PartialError", f"backend rate-limited; retry shortly: {err}"
    if isinstance(err, AuthError):
        return "PartialError", str(err)
    if isinstance(err, BackendError):
        return "PartialError", str(err)
    return "PartialError", f"unexpected error: {err}"
