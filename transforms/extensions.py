"""maltego-trx TransformRegistry configured for maltego-mcp."""

from maltego_trx.decorator_registry import TransformRegistry, TransformSet

registry = TransformRegistry(
    owner="maltego-mcp",
    author="Solomon Neas <srneas@gmail.com>",
    host_url="local",
    seed_ids=[],
)

registry.version = "0.2.0"
registry.display_name_suffix = " [MCP]"

MCP_TRANSFORM_SET = TransformSet(
    name="maltego-mcp",
    description="Right-click pivots into MISP, TheHive, Cortex, and ATT&CK.",
)
