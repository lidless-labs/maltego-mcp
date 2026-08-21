import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Graph } from "./graph.js";
import { valuePropertyForEntityType } from "./entities.js";

export async function readMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new Error(`failed to parse .mtgx zip: ${(err as Error).message}`);
  }
  const file = zip.file("Graphs/Graph1.graphml");
  if (!file) {
    throw new Error("missing Graphs/Graph1.graphml in .mtgx archive");
  }
  const xml = await file.async("string");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);
  const gml = parsed.graphml?.graph;
  if (!gml) {
    throw new Error("no graphml/graph element in .mtgx");
  }

  const graph = new Graph(newGraphId, "imported");
  const idMap = new Map<string, string>();
  const nodes = gml.node ? (Array.isArray(gml.node) ? gml.node : [gml.node]) : [];
  for (const node of nodes) {
    const oldId = node["@_id"];
    const dataEntries = Array.isArray(node.data) ? node.data : [node.data];
    const entityData = dataEntries.find((d: any) => d?.["mtg:MaltegoEntity"]);
    const type = entityData?.["mtg:MaltegoEntity"]?.["@_type"] ?? "maltego.Phrase";
    const valueProperty = valuePropertyForEntityType(type);
    const propsBlock = entityData?.["mtg:MaltegoEntity"]?.["mtg:Properties"]?.["mtg:Property"] ?? [];
    const propsArr = Array.isArray(propsBlock) ? propsBlock : [propsBlock];
    let value = "";
    const properties: Record<string, string> = {};
    for (const p of propsArr) {
      const name = p?.["@_name"];
      const val = String(p?.["mtg:Value"] ?? "");
      if (name === valueProperty) {
        value = val;
      } else if (name === "properties.value" && value === "") {
        // Backward compatibility with .mtgx files emitted before 0.4.x.
        value = val;
      } else if (name) {
        properties[name] = val;
      }
    }

    let position: { x: number; y: number } | undefined;

    // Native Maltego MTGX renderer.
    const rendererData = dataEntries.find((d: any) => d?.["mtg:EntityRenderer"]);
    const nativePosition = rendererData?.["mtg:EntityRenderer"]?.["mtg:Position"];
    if (nativePosition) {
      const x = Number(nativePosition["@_x"]);
      const y = Number(nativePosition["@_y"]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        position = { x, y };
      }
    }

    // Backward compatibility with the old yEd ShapeNode writer format.
    if (!position) {
      const graphicsData = dataEntries.find((d: any) => d?.["y:ShapeNode"]);
      const geometry = graphicsData?.["y:ShapeNode"]?.["y:Geometry"];
      if (geometry) {
        const x = Number(geometry["@_x"]);
        const y = Number(geometry["@_y"]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          position = { x, y };
        }
      }
    }

    const added = graph.addEntity({ type, value, properties, position });
    idMap.set(oldId, added.id);
  }

  const edges = gml.edge ? (Array.isArray(gml.edge) ? gml.edge : [gml.edge]) : [];
  for (const edge of edges) {
    const fromOld = edge["@_source"];
    const toOld = edge["@_target"];
    const from = idMap.get(fromOld);
    const to = idMap.get(toOld);
    if (!from || !to) continue;

    const dataEntries = Array.isArray(edge.data) ? edge.data : [edge.data];
    const linkData = dataEntries.find((d: any) => d?.["mtg:MaltegoLink"]);
    const linkProps = linkData?.["mtg:MaltegoLink"]?.["mtg:Properties"]?.["mtg:Property"];
    const propsArr = linkProps ? (Array.isArray(linkProps) ? linkProps : [linkProps]) : [];
    let label: string | undefined;
    const properties: Record<string, string> = {};
    for (const p of propsArr) {
      const name = p?.["@_name"];
      const val = String(p?.["mtg:Value"] ?? "");
      if (name === "maltego.link.manual.type" || name === "maltego.link.label") {
        if (val) label = val;
      } else if (name === "maltego.link.show-label") {
        continue;
      } else if (name) {
        properties[name] = val;
      }
    }
    graph.addLink({ from, to, label, properties });
  }
  return graph;
}

export async function readMtgxFile(path: string, newGraphId: string): Promise<Graph> {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  return readMtgxBytes(bytes, newGraphId);
}
