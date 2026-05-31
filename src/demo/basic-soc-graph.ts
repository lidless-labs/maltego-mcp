import { Graph } from "../graph/graph.js";

export const BASIC_SOC_DEMO_NAME = "maltego-mcp Basic SOC demo";

export function buildBasicSocDemoGraph(): Graph {
  const graph = new Graph("g-basic-soc-demo", BASIC_SOC_DEMO_NAME);

  const domain = graph.addEntity({
    type: "Domain",
    value: "login-update.example",
    properties: {
      source: "demo",
      note: "Suspicious domain from inbound report",
    },
    position: { x: 0, y: 140 },
  });
  const ip = graph.addEntity({
    type: "IPv4Address",
    value: "203.0.113.42",
    properties: {
      source: "demo",
      note: "RFC 5737 documentation address",
    },
    position: { x: 260, y: 140 },
  });
  const netblock = graph.addEntity({
    type: "Netblock",
    value: "203.0.113.0/24",
    properties: { role: "documentation netblock" },
    position: { x: 520, y: 60 },
  });
  const asn = graph.addEntity({
    type: "AS",
    value: "64512",
    properties: {
      organization: "Example Transit",
      registry: "reserved",
    },
    position: { x: 520, y: 220 },
  });
  const hash = graph.addEntity({
    type: "Hash",
    value: "d41d8cd98f00b204e9800998ecf8427e",
    properties: {
      algorithm: "md5",
      note: "Demo file indicator",
    },
    position: { x: 260, y: 360 },
  });
  const mailbox = graph.addEntity({
    type: "EmailAddress",
    value: "alerts@example.invalid",
    properties: { source: "demo" },
    position: { x: 0, y: 360 },
  });
  const mispEvent = graph.addEntity({
    type: "Phrase",
    value: "[MISP] Event #1001 - demo phishing cluster",
    properties: {
      platform: "MISP",
      kind: "event",
      workflow: "Use misp-mcp for live enrichment",
    },
    position: { x: 780, y: 60 },
  });
  const theHiveCase = graph.addEntity({
    type: "Phrase",
    value: "[TheHive] Case #42 - demo investigation",
    properties: {
      platform: "TheHive",
      kind: "case",
      workflow: "Use thehive-mcp for live case updates",
    },
    position: { x: 780, y: 220 },
  });
  const cortexReport = graph.addEntity({
    type: "Phrase",
    value: "[Cortex] Analyzer verdict - suspicious",
    properties: {
      platform: "Cortex",
      verdict: "suspicious",
      workflow: "Use cortex-mcp for analyzer results",
    },
    position: { x: 780, y: 380 },
  });
  const technique = graph.addEntity({
    type: "Phrase",
    value: "[T1566] Phishing",
    properties: {
      matrix: "MITRE ATT&CK Enterprise",
      workflow: "Use mitre-mcp for technique expansion",
    },
    position: { x: 1040, y: 220 },
  });
  const playbook = graph.addEntity({
    type: "Phrase",
    value: "[Playbook] Triage phishing IOC",
    properties: {
      action: "Open generated graph, inspect pivots, then run live MCP lookups as needed",
    },
    position: { x: 1040, y: 380 },
  });

  graph.addLink({ from: domain.id, to: ip.id, label: "resolves to", properties: {} });
  graph.addLink({ from: ip.id, to: netblock.id, label: "within", properties: {} });
  graph.addLink({ from: ip.id, to: asn.id, label: "announced by", properties: {} });
  graph.addLink({ from: mailbox.id, to: domain.id, label: "reported", properties: {} });
  graph.addLink({ from: domain.id, to: hash.id, label: "delivered sample", properties: {} });
  graph.addLink({ from: domain.id, to: mispEvent.id, label: "appears in", properties: {} });
  graph.addLink({ from: hash.id, to: mispEvent.id, label: "attribute", properties: {} });
  graph.addLink({ from: mispEvent.id, to: theHiveCase.id, label: "escalated to", properties: {} });
  graph.addLink({ from: hash.id, to: cortexReport.id, label: "analyzed by", properties: {} });
  graph.addLink({ from: theHiveCase.id, to: technique.id, label: "mapped to", properties: {} });
  graph.addLink({ from: cortexReport.id, to: technique.id, label: "supports", properties: {} });
  graph.addLink({ from: technique.id, to: playbook.id, label: "drives", properties: {} });

  return graph;
}
