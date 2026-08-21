import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";

async function graphmlFrom(graph: Graph) {
  const bytes = await writeMtgxBytes(graph);
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("Graphs/Graph1.graphml")!.async("string");
}

function parseGraphml(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  return parser.parse(xml);
}

describe("writeMtgxBytes", () => {
  it("produces a zip containing Graphs/Graph1.graphml", async () => {
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const bytes = await writeMtgxBytes(g);
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("Graphs/Graph1.graphml")).not.toBeNull();
  });

  it("embeds one <node> per entity", async () => {
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    g.addEntity({ type: "IPv4Address", value: "203.0.113.10", properties: {} });
    const parsed = parseGraphml(await graphmlFrom(g));
    const nodes = parsed.graphml.graph.node;
    const nodeArray = Array.isArray(nodes) ? nodes : [nodes];
    expect(nodeArray).toHaveLength(2);
  });

  it("embeds one <edge> per link with correct endpoints", async () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "203.0.113.10", properties: {} });
    g.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });
    const parsed = parseGraphml(await graphmlFrom(g));
    const edges = parsed.graphml.graph.edge;
    const edgeArray = Array.isArray(edges) ? edges : [edges];
    expect(edgeArray).toHaveLength(1);
    expect(edgeArray[0]["@_source"]).toBe(a.id);
    expect(edgeArray[0]["@_target"]).toBe(b.id);
  });

  it("emits native Maltego MTGX keys and renderers", async () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "203.0.113.10", properties: {} });
    g.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });

    const parsed = parseGraphml(await graphmlFrom(g));
    const keys = parsed.graphml.key;
    const keyArray = Array.isArray(keys) ? keys : [keys];

    expect(keyArray).toEqual(expect.arrayContaining([
      expect.objectContaining({ "@_id": "d4", "@_for": "node", "@_attr.name": "MaltegoEntity" }),
      expect.objectContaining({ "@_id": "d5", "@_for": "node", "@_yfiles.type": "nodegraphics" }),
      expect.objectContaining({ "@_id": "d6", "@_for": "edge", "@_attr.name": "MaltegoLink" }),
      expect.objectContaining({ "@_id": "d7", "@_for": "edge", "@_yfiles.type": "edgegraphics" })
    ]));

    const nodeData = parsed.graphml.graph.node[0].data;
    const nodeDataArray = Array.isArray(nodeData) ? nodeData : [nodeData];
    expect(nodeDataArray.find((d: any) => d["@_key"] === "d4")?.["mtg:MaltegoEntity"]).toBeDefined();
    expect(nodeDataArray.find((d: any) => d["@_key"] === "d5")?.["mtg:EntityRenderer"]?.["mtg:Position"]).toBeDefined();

    const edgeData = parsed.graphml.graph.edge.data;
    const edgeDataArray = Array.isArray(edgeData) ? edgeData : [edgeData];
    const link = edgeDataArray.find((d: any) => d["@_key"] === "d6")?.["mtg:MaltegoLink"];
    expect(link?.["@_type"]).toBe("maltego.link.manual-link");
    expect(edgeDataArray.find((d: any) => d["@_key"] === "d7")?.["mtg:LinkRenderer"]).toBeDefined();
  });

  it("uses the standard Maltego value property for each supported entity type", async () => {
    const expected: Record<string, string> = {
      "maltego.IPv4Address": "ipv4-address",
      "maltego.IPv6Address": "ipv6-address",
      "maltego.Domain": "fqdn",
      "maltego.URL": "url",
      "maltego.Hash": "properties.hash",
      "maltego.EmailAddress": "email",
      "maltego.Netblock": "ipv4-range",
      "maltego.AS": "as.number",
      "maltego.Website": "fqdn",
      "maltego.Company": "title",
      "maltego.Person": "person.fullname",
      "maltego.Phrase": "text"
    };

    const values: Record<string, string> = {
      "maltego.IPv4Address": "203.0.113.10",
      "maltego.IPv6Address": "2001:db8::1",
      "maltego.Domain": "example.com",
      "maltego.URL": "https://example.com/",
      "maltego.Hash": "d41d8cd98f00b204e9800998ecf8427e",
      "maltego.EmailAddress": "alice@example.com",
      "maltego.Netblock": "203.0.113.0-203.0.113.255",
      "maltego.AS": "64500",
      "maltego.Website": "www.example.com",
      "maltego.Company": "Example Corp",
      "maltego.Person": "Alice Example",
      "maltego.Phrase": "example phrase"
    };

    const g = new Graph("g-1", "t");
    for (const [type, value] of Object.entries(values)) {
      g.addEntity({ type, value, properties: {} });
    }

    const parsed = parseGraphml(await graphmlFrom(g));
    const nodes = Array.isArray(parsed.graphml.graph.node)
      ? parsed.graphml.graph.node
      : [parsed.graphml.graph.node];

    for (const node of nodes) {
      const data = Array.isArray(node.data) ? node.data : [node.data];
      const entity = data.find((d: any) => d["mtg:MaltegoEntity"])["mtg:MaltegoEntity"];
      const type = entity["@_type"];
      const props = Array.isArray(entity["mtg:Properties"]["mtg:Property"])
        ? entity["mtg:Properties"]["mtg:Property"]
        : [entity["mtg:Properties"]["mtg:Property"]];
      expect(props[0]["@_name"]).toBe(expected[type]);
      expect(String(props[0]["mtg:Value"])).toBe(values[type]);
    }
  });

  it("writes labels using Maltego manual-link properties", async () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "203.0.113.10", properties: {} });
    g.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });

    const parsed = parseGraphml(await graphmlFrom(g));
    const edgeData = Array.isArray(parsed.graphml.graph.edge.data)
      ? parsed.graphml.graph.edge.data
      : [parsed.graphml.graph.edge.data];
    const link = edgeData.find((d: any) => d["mtg:MaltegoLink"])["mtg:MaltegoLink"];
    const props = Array.isArray(link["mtg:Properties"]["mtg:Property"])
      ? link["mtg:Properties"]["mtg:Property"]
      : [link["mtg:Properties"]["mtg:Property"]];
    const byName = new Map(props.map((p: any) => [p["@_name"], String(p["mtg:Value"] ?? "")]));

    expect(byName.get("maltego.link.show-label")).toBe("1");
    expect(byName.get("maltego.link.manual.type")).toBe("resolves");
  });

  it("applies layout if entities lack positions", async () => {
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "example.com", properties: {} });
    const bytes = await writeMtgxBytes(g);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(g.allEntities()[0].position).toBeDefined();
  });

  it("produces valid XML (no bare boolean attributes)", async () => {
    const { XMLValidator } = await import("fast-xml-parser");
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "example.com", properties: { foo: "bar" } });
    const xml = await graphmlFrom(g);
    const validation = XMLValidator.validate(xml);
    expect(validation).toBe(true);
  });
});
