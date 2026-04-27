"""Loads ~/.maltego-mcp/config.toml plus env vars. Never logs secret values."""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover - we pin >=3.11
    import tomli as tomllib

log = logging.getLogger("transforms.config")


class ConfigError(RuntimeError):
    """Raised when config.toml is missing or required env var is unset."""


def default_config_dir() -> Path:
    """Resolve the platform default config dir.

    Windows: %APPDATA%/maltego-mcp
    POSIX:   ~/.maltego-mcp
    """
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if not appdata:
            raise ConfigError("APPDATA env var is unset on Windows")
        return Path(appdata) / "maltego-mcp"
    return Path.home() / ".maltego-mcp"


def _config_dir() -> Path:
    override = os.environ.get("MALTEGO_MCP_CONFIG_DIR")
    return Path(override) if override else default_config_dir()


@dataclass(frozen=True)
class BackendConfig:
    """One backend block (misp/thehive/cortex). api_key is read lazily from env."""

    url: str
    api_key_env: str
    verify_ssl: bool = True

    @property
    def api_key(self) -> str:
        value = os.environ.get(self.api_key_env)
        if not value:
            raise ConfigError(
                f"environment variable {self.api_key_env} is not set; "
                f"required to authenticate to {self.url}"
            )
        return value


@dataclass(frozen=True)
class Config:
    misp: BackendConfig
    thehive: BackendConfig
    cortex: BackendConfig
    network_timeout_s: int

    @classmethod
    def from_toml(cls, path: Path) -> Config:
        with path.open("rb") as fh:
            data = tomllib.load(fh)
        misp = BackendConfig(
            url=data["misp"]["url"],
            api_key_env=data["misp"]["api_key_env"],
            verify_ssl=bool(data["misp"].get("verify_ssl", True)),
        )
        thehive = BackendConfig(
            url=data["thehive"]["url"],
            api_key_env=data["thehive"]["api_key_env"],
            verify_ssl=bool(data["thehive"].get("verify_ssl", True)),
        )
        cortex = BackendConfig(
            url=data["cortex"]["url"],
            api_key_env=data["cortex"]["api_key_env"],
            verify_ssl=bool(data["cortex"].get("verify_ssl", True)),
        )
        timeout = int(data.get("network", {}).get("timeout_s", 30))
        log.debug("loaded config from %s (network.timeout_s=%d)", path, timeout)
        return cls(misp=misp, thehive=thehive, cortex=cortex, network_timeout_s=timeout)


def load_config() -> Config:
    cfg_path = _config_dir() / "config.toml"
    if not cfg_path.exists():
        raise ConfigError(
            f"config.toml not found at {cfg_path}; "
            f"see transforms/README.md for setup instructions"
        )
    return Config.from_toml(cfg_path)
