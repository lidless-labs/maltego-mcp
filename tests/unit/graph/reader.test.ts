import { describe, it, expect } from "vitest";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";
import JSZip from "jszip";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMtgxFile } from "../../../src/graph/reader.js";
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

async function archive(xml: string) {
  return new JSZip().file("Graphs/Graph1.graphml", xml).generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("MTGX import budgets", () => {
  it("rejects compressed input before ZIP parsing", async () => {
    await expect(readMtgxBytes(new Uint8Array(8 * 1024 * 1024 + 1), "large")).rejects.toThrow(/compressed.*limit/i);
  });

  it("rejects oversized files before reading their contents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mtgx-budget-"));
    try {
      const path = join(dir, "large.mtgx");
      const handle = await open(path, "wx");
      await handle.truncate(8 * 1024 * 1024 + 1);
      await handle.close();
      await expect(readMtgxFile(path, "large")).rejects.toThrow(/compressed.*limit/i);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("stops a compressed expansion at the decompressed byte limit", async () => {
    const bytes = await archive(`<graphml><graph>${" ".repeat(16 * 1024 * 1024)}</graph></graphml>`);
    await expect(readMtgxBytes(bytes, "bomb")).rejects.toThrow(/decompressed.*limit/i);
  });

  it.each([
    ["entities", '<node id="n"/>'.repeat(10_001)],
    ["links", '<edge source="n" target="n"/>'.repeat(20_001)],
    ["elements", '<data/>'.repeat(100_001)],
    ["depth", '<a>'.repeat(65) + '</a>'.repeat(65)],
    ["DTD", '<!DOCTYPE graphml [<!ENTITY x "expanded">]><graphml><graph>&x;</graph></graphml>'],
  ])("rejects excessive %s before building a graph", async (_name, body) => {
    const xml = body.startsWith('<!') ? body : `<graphml><graph>${body}</graph></graphml>`;
    await expect(readMtgxBytes(await archive(xml), "growth")).rejects.toThrow(/limit|DTD|DOCTYPE|depth|nested tags/i);
  });

  it("bounds concurrent imports and releases slots after failure", async () => {
    const bytes = await archive('<graphml><graph id="G"/></graphml>');
    const first = readMtgxBytes(bytes, "a");
    const second = readMtgxBytes(bytes, "b");
    const third = readMtgxBytes(bytes, "c");
    await expect(third).rejects.toThrow(/concurrent.*limit/i);
    await Promise.all([first, second]);
    await expect(readMtgxBytes(new Uint8Array(), "bad")).rejects.toThrow();
    await expect(readMtgxBytes(bytes, "again")).resolves.toBeInstanceOf(Graph);
  });
});
