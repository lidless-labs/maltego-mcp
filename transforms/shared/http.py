"""Thin wrapper over requests.Session with timeout and redacted error surface."""

from __future__ import annotations

from typing import Any

import requests

from .config import Config

REDACTED_HEADERS = ("Authorization", "X-Api-Key", "Cookie")


class HttpError(RuntimeError):
    """Raised when an HTTP call returns >= 400 or the network errors out."""


class HttpClient:
    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._session = requests.Session()

    def get_json(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        verify: bool = True,
    ) -> Any:
        return self._call("GET", url, headers=headers, params=params, verify=verify)

    def post_json(
        self,
        url: str,
        json_body: dict[str, Any],
        headers: dict[str, str] | None = None,
        verify: bool = True,
    ) -> Any:
        return self._call("POST", url, headers=headers, json=json_body, verify=verify)

    def _call(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        verify: bool = True,
    ) -> Any:
        try:
            resp = self._session.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json,
                timeout=self._cfg.network_timeout_s,
                verify=verify,
            )
        except requests.RequestException as exc:
            redacted = self._redact_headers(headers)
            raise HttpError(
                f"network error calling {method} {url} (headers={redacted}): {exc}"
            ) from exc

        if resp.status_code >= 400:
            redacted = self._redact_headers(headers)
            raise HttpError(
                f"HTTP {resp.status_code} from {method} {url} (headers={redacted}): "
                f"{resp.text[:200]}"
            )
        try:
            return resp.json()
        except ValueError as exc:
            raise HttpError(
                f"non-JSON response from {url}: {resp.text[:200]}"
            ) from exc

    @staticmethod
    def _redact_headers(headers: dict[str, str] | None) -> dict[str, str]:
        if not headers:
            return {}
        return {
            k: ("[redacted]" if k in REDACTED_HEADERS else v)
            for k, v in headers.items()
        }
