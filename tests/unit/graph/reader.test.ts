import { describe, it, expect, vi } from "vitest";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
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
  return new JSZip().file("Graphs/Graph1.graphml", xml, { createFolders: false }).generateAsync({ type: "uint8array", compression: "DEFLATE" });
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

  it("stops a compressed expansion even when its declared size is understated", async () => {
    const bytes = Buffer.from(await archive(`<graphml><graph>${" ".repeat(16 * 1024 * 1024)}</graph></graphml>`));
    // Preserve the streaming byte guard independently of the metadata guard.
    const central = bytes.readUInt32LE(bytes.length - 6);
    bytes.writeUInt32LE(1, central + 24);
    bytes.writeUInt32LE(1, bytes.readUInt32LE(central + 42) + 22);
    await expect(readMtgxBytes(bytes, "bomb")).rejects.toThrow(/^decompressed GraphML byte limit/);
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


describe("GraphML structural preflight", () => {
  it.each([
    ["depth", "<a>".repeat(65) + "</a>".repeat(65)],
    ["elements", "<data/>".repeat(100_001)],
    ["total attributes", '<data a="x" b="y"/>'.repeat(50_001)],
    ["tag length instruction", '<?meta value > ' + "x".repeat(65536) + '?>'],
    ["tag length", '<data a="' + "x".repeat(65536) + '"/>'],
    ["attributes", "<data " + Array.from({ length: 129 }, (_, i) => `a${i}="x"`).join(" ") + "/>"],
  ])("rejects %s before the unrestricted validator", async (_kind, body) => {
    const validate = vi.spyOn(XMLValidator, "validate");
    try {
      await expect(readMtgxBytes(await archive(`<graphml><graph>${body}</graph></graphml>`), "guard")).rejects.toThrow(_kind.includes("attributes") ? /attribute limit/ : _kind.startsWith("tag length") ? /tag length limit/ : /limit|depth|nested tags/i);
      expect(validate.mock.calls.length).toBe(0);
    } finally { validate.mockRestore(); }
  });

  it.each([
    "<graphml><graph></graphml>",
    '<graphml><graph id="a" id="b"/></graphml>',
    '<graphml><graph><data broken/></graph></graphml>',
  ])("rejects bounded malformed XML: %s", async xml => {
    await expect(readMtgxBytes(await archive(xml), "malformed")).rejects.toThrow(/invalid GraphML/);
  });

  it("ignores markup inside comments, CDATA and quoted attributes", async () => {
    const xml = '<graphml><!-- <a>' + '<a>'.repeat(70) + ' --><graph id="G" note="a > b"><data><![CDATA[' + '<a>'.repeat(70) + ']]></data></graph></graphml>';
    await expect(readMtgxBytes(await archive(xml), "valid")).resolves.toBeInstanceOf(Graph);
  });
});

describe("ZIP metadata preflight", () => {
  async function fixture() {
    const zip = new JSZip();
    zip.file("Graphs/Graph1.graphml", '<graphml><graph id="G"/></graphml>', { createFolders: false });
    zip.file("unused-a", "");
    zip.file("unused-b", "");
    zip.file("unused-c", "");
    return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
  }

  // Fixtures stay small. Only metadata is changed, never expanded payloads.
  const corruptions: [string, (b: Buffer, end: number, central: number) => Buffer | void][] = [
    ["EOCD entry count over limit", (b, e) => { b.writeUInt16LE(1025, e + 8); b.writeUInt16LE(1025, e + 10); }],
    ["understated entry count", (b, e) => { b.writeUInt16LE(1, e + 8); b.writeUInt16LE(1, e + 10); }],
    ["overstated entry count", (b, e) => { b.writeUInt16LE(5, e + 8); b.writeUInt16LE(5, e + 10); }],
    ["zero count with entries", (b, e) => { b.writeUInt16LE(0, e + 8); b.writeUInt16LE(0, e + 10); }],
    ["inconsistent disk counts", (b, e) => { b.writeUInt16LE(1, e + 8); }],
    ["split EOCD disk", (b, e) => { b.writeUInt16LE(1, e + 4); }],
    ["split central disk", (b, e) => { b.writeUInt16LE(1, e + 6); }],
    ["ZIP64 count sentinel", (b, e) => { b.writeUInt16LE(0xffff, e + 10); }],
    ["ZIP64 size sentinel", (b, e) => { b.writeUInt32LE(0xffffffff, e + 12); }],
    ["ZIP64 offset sentinel", (b, e) => { b.writeUInt32LE(0xffffffff, e + 16); }],
    ["missing EOCD", (b, e) => b.subarray(0, e)],
    ["truncated EOCD", (b) => b.subarray(0, b.length - 1)],
    ["truncated archive comment", (b, e) => { b.writeUInt16LE(1, e + 20); }],
    ["unaccounted trailing bytes", b => Buffer.concat([b, Buffer.from("trailing")])],
    ["unaccounted prefix", b => Buffer.concat([Buffer.from("prefix"), b])],
    ["central offset outside archive", (b, e) => { b.writeUInt32LE(b.length + 1, e + 16); }],
    ["central size mismatch", (b, e) => { b.writeUInt32LE(b.readUInt32LE(e + 12) - 1, e + 12); }],
    ["truncated central header", (b, e) => { b.writeUInt32LE(20, e + 12); b.writeUInt32LE(e - 20, e + 16); }],
    ["invalid central signature", (b, _e, c) => { b.writeUInt32LE(0, c); }],
    ["truncated central name", (b, _e, c) => { b.writeUInt16LE(1000, c + 28); }],
    ["oversized central filename", (b, _e, c) => { b.writeUInt16LE(1025, c + 28); }],
    ["oversized entry extra fields", (b, _e, c) => { b.writeUInt16LE(4097, c + 30); }],
    ["oversized entry comment", (b, _e, c) => { b.writeUInt16LE(4097, c + 32); }],
    ["split entry disk", (b, _e, c) => { b.writeUInt16LE(1, c + 34); }],
    ["oversized declared compressed entry", (b, _e, c) => { b.writeUInt32LE(8 * 1024 * 1024 + 1, c + 20); }],
    ["oversized declared decompressed entry", (b, _e, c) => { b.writeUInt32LE(16 * 1024 * 1024 + 1, c + 24); }],
    ["ZIP64 entry size sentinel", (b, _e, c) => { b.writeUInt32LE(0xffffffff, c + 24); }],
    ["ZIP64 local offset sentinel", (b, _e, c) => { b.writeUInt32LE(0xffffffff, c + 42); }],
    ["local offset inside central directory", (b, _e, c) => { b.writeUInt32LE(c, c + 42); }],
    ["truncated local header", (b, _e, c) => { b.writeUInt32LE(c - 29, c + 42); }],
    ["invalid local signature", b => { b.writeUInt32LE(0, 0); }],
    ["oversized local filename", b => { b.writeUInt16LE(1025, 26); }],
    ["ZIP64 local size sentinel", b => { b.writeUInt32LE(0xffffffff, 22); }],
    ["oversized local declared size", b => { b.writeUInt32LE(16 * 1024 * 1024 + 1, 22); }],
    ["truncated local data", b => { b.writeUInt16LE(1000, 28); }],
    ["total declared decompressed bytes", (b, e, c) => {
      for (let i = 0; i < 4; i++) {
        b.writeUInt32LE(16 * 1024 * 1024, c + 24);
        c += 46 + b.readUInt16LE(c + 28) + b.readUInt16LE(c + 30) + b.readUInt16LE(c + 32);
      }
    }],
  ];

  it.each(corruptions)("rejects %s before JSZip allocates entries", async (_name, mutate) => {
    const bytes = await fixture();
    const end = bytes.length - 22;
    const altered = mutate(bytes, end, bytes.readUInt32LE(end + 16)) ?? bytes;
    const load = vi.spyOn(JSZip, "loadAsync");
    try {
      const error = await readMtgxBytes(altered, "metadata").then(() => undefined, error => error);
      expect(load).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/ZIP metadata/);
    } finally { load.mockRestore(); }
  });

  // Insert a bounded central extra field without changing local data offsets.
  function withExtra(bytes: Buffer, extra: Buffer): Buffer {
    const end = bytes.length - 22;
    const central = bytes.readUInt32LE(end + 16);
    const position = central + 46 + bytes.readUInt16LE(central + 28);
    bytes.writeUInt16LE(extra.length, central + 30);
    bytes.writeUInt32LE(bytes.readUInt32LE(end + 12) + extra.length, end + 12);
    return Buffer.concat([bytes.subarray(0, position), extra, bytes.subarray(position)]);
  }

  it.each([
    ["ZIP64 field", Buffer.from([1, 0, 0, 0])],
    ["truncated extra header", Buffer.from([2, 0, 0])],
    ["truncated extra value", Buffer.from([2, 0, 2, 0, 0])],
    ["too many extra fields", Buffer.alloc(65 * 4, 0)],
    ["short Unicode path", Buffer.from([0x75, 0x70, 1, 0, 1])],
    ["oversized Unicode path", Buffer.concat([Buffer.from([0x75, 0x70, 6, 4]), Buffer.alloc(1030)])],
  ] as const)("rejects %s before parsing extra-field objects", async (_name, extra) => {
    const bytes = withExtra(await fixture(), extra);
    const load = vi.spyOn(JSZip, "loadAsync");
    try {
      const error = await readMtgxBytes(bytes, "extra").then(() => undefined, error => error);
      expect(load).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/ZIP metadata/);
    } finally { load.mockRestore(); }
  });

  it.each([1024, 1025])("bounds real entry tables (%i members)", async count => {
    const zip = new JSZip().file("Graphs/Graph1.graphml", '<graphml><graph id="G"/></graphml>', { createFolders: false });
    for (let i = 1; i < count; i++) zip.file(`unused-${i}`, "");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const load = vi.spyOn(JSZip, "loadAsync");
    try {
      if (count === 1024) await expect(readMtgxBytes(bytes, "boundary")).resolves.toBeInstanceOf(Graph);
      else {
        await expect(readMtgxBytes(bytes, "boundary")).rejects.toThrow(/ZIP metadata.*entry limit/);
        expect(load).not.toHaveBeenCalled();
      }
    } finally { load.mockRestore(); }
  });

  it.each([1024, 1025])("bounds actual filename bytes (%i bytes)", async length => {
    const zip = new JSZip().file("Graphs/Graph1.graphml", '<graphml><graph id="G"/></graphml>', { createFolders: false });
    zip.file("x".repeat(length), "");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const load = vi.spyOn(JSZip, "loadAsync");
    try {
      if (length === 1024) await expect(readMtgxBytes(bytes, "path")).resolves.toBeInstanceOf(Graph);
      else {
        await expect(readMtgxBytes(bytes, "path")).rejects.toThrow(/ZIP metadata.*path limit/);
        expect(load).not.toHaveBeenCalled();
      }
    } finally { load.mockRestore(); }
  });

  it("accepts ordinary comments and streamed data descriptors in a byte view", async () => {
    const zip = new JSZip().file("Graphs/Graph1.graphml", '<graphml><graph id="G"/></graphml>', { comment: "graph note" });
    const bytes = await zip.generateAsync({ type: "uint8array", streamFiles: true, comment: "ordinary archive comment" });
    const padded = Buffer.concat([Buffer.from("outside"), bytes, Buffer.from("outside")]);
    await expect(readMtgxBytes(padded.subarray(7, 7 + bytes.length), "comment")).resolves.toBeInstanceOf(Graph);
  });

  it("keeps Graph1 selection case sensitive", async () => {
    const zip = new JSZip().file("Graphs/graph1.graphml", '<graphml><graph id="G"/></graphml>');
    await expect(readMtgxBytes(await zip.generateAsync({ type: "uint8array" }), "case")).rejects.toThrow(/missing Graphs\/Graph1.graphml/);
  });
});
