import { describe, expect, it } from "vitest";
import { buildIocGraph } from "../../../src/tools/build-ioc-graph.js";

describe("buildIocGraph", () => {
  it("composes IOC enrichment into one investigation graph", () => {
    const graph = buildIocGraph({
      ioc: { type: "Domain", value: "evil.example" },
      outputPath: "ignored.mtgx",
      notes: ["triage from inbound email"],
      mispEvents: [{ id: 1001, info: "phishing campaign" }],
      thehiveCases: [{ id: "42", title: "Phishing triage", severity: "high", status: "Open" }],
      cortexReports: [{ analyzer: "VirusTotal", verdict: "suspicious", summary: "demo report" }],
      attackTechniques: [{ id: "T1566", name: "Phishing", tactic: "Initial Access" }],
    });

    expect(graph.entityCount()).toBe(6);
    expect(graph.linkCount()).toBe(5);
    expect(graph.allEntities().map((entity) => entity.value)).toEqual(expect.arrayContaining([
      "evil.example",
      "[MISP] phishing campaign",
      "[TheHive] Phishing triage",
      "[Cortex] VirusTotal - suspicious",
      "[T1566] Phishing",
    ]));
  });

  it("adds omitted-result nodes when a section exceeds maxItemsPerSection", () => {
    const graph = buildIocGraph({
      ioc: { type: "IPv4Address", value: "203.0.113.42" },
      outputPath: "ignored.mtgx",
      maxItemsPerSection: 1,
      mispEvents: [
        { id: 1, info: "first" },
        { id: 2, info: "second" },
        { id: 3, info: "third" },
      ],
    });

    expect(graph.allEntities().map((entity) => entity.value)).toEqual(expect.arrayContaining([
      "[MISP] first",
      "[MISP] 2 more results omitted",
    ]));
  });
});
