import { describe, it, expect } from "vitest";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";
import { readMtgxBytes } from "../../../src/graph/reader.js";

describe("readMtgxBytes", () => {
  it("round-trips a simple graph", async () => {
    const original = new Graph("g-1", "rt");
    const a = original.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const b = original.addEntity({ type: "IPv4Address", value: "203.0.113.10", properties: {} });
    original.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });

    const bytes = await writeMtgxBytes(original);
    const restored = await readMtgxBytes(bytes, "g-2");

    expect(restored.entityCount()).toBe(2);
    expect(restored.linkCount()).toBe(1);
    const values = restored.allEntities().map((e) => e.value).sort();
    expect(values).toEqual(["203.0.113.10", "example.com"]);
    expect(restored.allLinks()[0].label).toBe("resolves");
  });

  it("throws on malformed zip", async () => {
    const bad = new Uint8Array([0x00, 0x01, 0x02]);
    await expect(readMtgxBytes(bad, "g-x")).rejects.toThrow(/parse|zip/i);
  });

  it("throws when Graphs/Graph1.graphml is missing", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("unrelated.txt", "hi");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(readMtgxBytes(bytes, "g-x")).rejects.toThrow(/Graph1\.graphml/);
  });

  it("preserves entity positions across round-trip", async () => {
    const original = new Graph("g-1", "rt");
    const a = original.addEntity({
      type: "Domain",
      value: "example.com",
      properties: {},
      position: { x: 100, y: 200 }
    });
    const b = original.addEntity({
      type: "IPv4Address",
      value: "203.0.113.10",
      properties: {},
      position: { x: 340, y: 50 }
    });
    original.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });

    const bytes = await writeMtgxBytes(original);
    const restored = await readMtgxBytes(bytes, "g-2");

    const aRestored = restored.allEntities().find((e) => e.value === "example.com");
    const bRestored = restored.allEntities().find((e) => e.value === "203.0.113.10");
    expect(aRestored?.position).toEqual({ x: 100, y: 200 });
    expect(bRestored?.position).toEqual({ x: 340, y: 50 });
  });

  it("still reads the legacy properties.value/y:ShapeNode format", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("Graphs/Graph1.graphml", `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:mtg="http://maltego.paterva.com/xml/mtgx" xmlns:y="http://www.yworks.com/xml/graphml">
  <graph id="G" edgedefault="directed">
    <node id="e-1">
      <data key="d0">
        <mtg:MaltegoEntity type="maltego.Domain">
          <mtg:Properties>
            <mtg:Property name="properties.value" displayName="Value" type="string" nullable="true" hidden="false" readonly="false">
              <mtg:Value>example.com</mtg:Value>
            </mtg:Property>
          </mtg:Properties>
        </mtg:MaltegoEntity>
      </data>
      <data key="d1">
        <y:ShapeNode>
          <y:Geometry x="12" y="34" width="80" height="80"/>
        </y:ShapeNode>
      </data>
    </node>
  </graph>
</graphml>`);
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const restored = await readMtgxBytes(bytes, "g-legacy");
    expect(restored.allEntities()[0].value).toBe("example.com");
    expect(restored.allEntities()[0].position).toEqual({ x: 12, y: 34 });
  });
});
