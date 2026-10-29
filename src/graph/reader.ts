import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Graph } from "./graph.js";
import { valuePropertyForEntityType } from "./entities.js";

const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_XML_BYTES = 16 * 1024 * 1024;
let activeImports = 0;

async function withImportSlot<T>(operation: () => Promise<T>): Promise<T> {
  // Reject excess work instead of retaining an unbounded queue of input buffers.
  if (activeImports >= 2) throw new Error("concurrent import limit exceeded (2)");
  activeImports++;
  try { return await operation(); }
  finally { activeImports--; }
}

function checkCompressedSize(size: number): void {
  if (size > MAX_COMPRESSED_BYTES) throw new Error("compressed MTGX byte limit exceeded (8 MiB)");
}

async function extractGraphml(file: JSZip.JSZipObject): Promise<string> {
  // JSZip's public stream helper can pause the upstream compressed-input worker.
  // Never accumulate the entire expansion with file.async().
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let stopped = false;
    // JSZip documents this API but omits it from JSZipObject's declarations.
    const stream = (file as JSZip.JSZipObject & {
      internalStream(type: "nodebuffer"): JSZip.JSZipStreamHelper<Buffer>;
    }).internalStream("nodebuffer");
    stream.on("data", (chunk: Buffer) => {
      if (stopped) return;
      size += chunk.length;
      if (size > MAX_XML_BYTES) {
        stopped = true;
        stream.pause();
        chunks.length = 0;
        reject(new Error("decompressed GraphML byte limit exceeded (16 MiB)"));
      } else { chunks.push(chunk); }
    });
    stream.on("error", (error: Error) => { chunks.length = 0; reject(error); });
    stream.on("end", () => {
      if (!stopped) resolve(Buffer.concat(chunks, size).toString("utf8"));
    });
    stream.resume();
  });
}

export async function readMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
  checkCompressedSize(bytes.byteLength);
  return withImportSlot(() => parseMtgxBytes(bytes, newGraphId));
}

async function parseMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
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
  const xml = await extractGraphml(file);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("DTD declarations are not allowed in GraphML");
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`invalid GraphML: ${validation.err.msg}`);
  let elements = 0;
  let entities = 0;
  let links = 0;
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    maxNestedTags: 64,
    updateTag(name) {
      if (++elements > 100_000) throw new Error("XML element limit exceeded (100000)");
      if (name === "node" && ++entities > 10_000) throw new Error("entity limit exceeded (10000)");
      if (name === "edge" && ++links > 20_000) throw new Error("link limit exceeded (20000)");
      return name;
    },
  });
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
  return withImportSlot(async () => {
    const { open } = await import("node:fs/promises");
    const { constants } = await import("node:fs");
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new Error("MTGX input must be a regular file");
      checkCompressedSize(stat.size);
      const chunks: Buffer[] = [];
      let size = 0;
      // A capped read also protects against growth after fstat.
      for await (const chunk of file.createReadStream({ autoClose: false, highWaterMark: 64 * 1024 })) {
        size += chunk.length;
        checkCompressedSize(size);
        chunks.push(chunk);
      }
      return await parseMtgxBytes(Buffer.concat(chunks, size), newGraphId);
    } finally { await file.close(); }
  });
}
