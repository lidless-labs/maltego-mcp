"""HTTP client: timeouts honoured, auth header redacted in errors, cert toggle."""

from __future__ import annotations

from pathlib import Path

import pytest
import requests
import responses

from transforms.shared.config import load_config
from transforms.shared.http import HttpClient, HttpError


def test_get_attaches_authorization_header(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    cfg = load_config()
    client = HttpClient(cfg)
    mocked_responses.get(
        "https://misp.test/health",
        json={"ok": True},
        status=200,
        match=[responses.matchers.header_matcher({"Authorization": "test-misp-key"})],
    )
    body = client.get_json(
        f"{cfg.misp.url}/health", headers={"Authorization": cfg.misp.api_key}
    )
    assert body == {"ok": True}


def test_timeout_passed_to_requests(
    fake_config: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cfg = load_config()
    captured: dict[str, object] = {}

    def fake_request(self, method: str, url: str, **kwargs: object) -> requests.Response:
        captured["timeout"] = kwargs.get("timeout")
        r = requests.Response()
        r.status_code = 200
        r._content = b"{}"
        return r

    monkeypatch.setattr(requests.Session, "request", fake_request)
    client = HttpClient(cfg)
    client.get_json("https://x/y")
    assert captured["timeout"] == 5


def test_redacts_auth_header_in_error_message(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    cfg = load_config()
    mocked_responses.get(
        "https://misp.test/blow-up",
        json={"error": "denied"},
        status=403,
    )
    client = HttpClient(cfg)
    with pytest.raises(HttpError) as ei:
        client.get_json(
            "https://misp.test/blow-up", headers={"Authorization": "secret-key-value"}
        )
    msg = str(ei.value)
    assert "secret-key-value" not in msg
    assert "[redacted]" in msg


def test_post_json_succeeds(
    fake_config: Path, mocked_responses: responses.RequestsMock
) -> None:
    cfg = load_config()
    mocked_responses.post(
        "https://misp.test/attributes/restSearch",
        json={"response": {"Attribute": []}},
        status=200,
    )
    client = HttpClient(cfg)
    body = client.post_json(
        "https://misp.test/attributes/restSearch",
        json_body={"value": "1.2.3.4"},
        headers={"Authorization": "k"},
    )
    assert body == {"response": {"Attribute": []}}


def test_network_error_raises_http_error_with_redaction(
    fake_config: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cfg = load_config()

    def boom(self, method, url, **kwargs):
        raise requests.ConnectionError("DNS failure")

    monkeypatch.setattr(requests.Session, "request", boom)
    client = HttpClient(cfg)
    with pytest.raises(HttpError) as ei:
        client.get_json("https://x/y", headers={"Authorization": "leak-this"})
    assert "leak-this" not in str(ei.value)
