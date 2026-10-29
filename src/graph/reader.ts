import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Graph } from "./graph.js";
import { valuePropertyForEntityType } from "./entities.js";

const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1024;
const MAX_ZIP_PATH_BYTES = 1024;
const MAX_ZIP_EXTRA_BYTES = 4096;
const MAX_ZIP_COMMENT_BYTES = 4096;
const MAX_ZIP_TOTAL_BYTES = 32 * 1024 * 1024;
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

function zipMetadataError(message: string): never {
  throw new Error(`ZIP metadata: ${message}`);
}

function checkZipExtra(bytes: Buffer, start: number, length: number): void {
  const end = start + length;
  let fields = 0;
  while (start < end) {
    if (start + 4 > end) zipMetadataError("truncated extra field header");
    if (++fields > 64) zipMetadataError("extra field count limit exceeded (64 per header)");
    const id = bytes.readUInt16LE(start);
    const size = bytes.readUInt16LE(start + 2);
    start += 4;
    if (start + size > end) zipMetadataError("truncated extra field");
    if (id === 0x0001) zipMetadataError("ZIP64 is not supported");
    // JSZip can take a filename from this field instead of the local header.
    if (id === 0x7075 && (size < 5 || size - 5 > MAX_ZIP_PATH_BYTES)) {
      zipMetadataError("Unicode path limit exceeded or malformed field (1024 bytes)");
    }
    start += size;
  }
}

/** Bound metadata before JSZip creates entry objects, decoded names or extras.
 * Require exact offsets/counts: JSZip otherwise tolerates incorrect counts and
 * rebases offsets for prepended data. This supports ordinary single-disk ZIP,
 * including data descriptors, but deliberately excludes ZIP64.
 */
function checkZipMetadata(input: Uint8Array | Buffer): void {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  // Use the same last signature as JSZip so a comment cannot redirect its parser.
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < Math.max(0, bytes.length - 22 - 0xffff) || end + 22 > bytes.length) {
    zipMetadataError("missing or truncated ZIP end record");
  }
  if (end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) {
    zipMetadataError("invalid ZIP end comment length or trailing bytes");
  }
  const disk = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralStart = bytes.readUInt32LE(end + 16);
  if (disk === 0xffff || centralDisk === 0xffff || diskEntries === 0xffff || entries === 0xffff ||
      centralSize === 0xffffffff || centralStart === 0xffffffff) zipMetadataError("ZIP64 is not supported");
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries) zipMetadataError("split-disk ZIP is not supported");
  if (entries > MAX_ZIP_ENTRIES) zipMetadataError("entry limit exceeded (1024)");
  if (centralStart + centralSize !== end || entries * 46 > centralSize) {
    zipMetadataError("invalid central directory offset or size");
  }
  let cursor = centralStart;
  let totalBytes = 0;
  let totalCompressedBytes = 0;
  for (let entry = 0; entry < entries; entry++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      zipMetadataError("truncated or invalid central header");
    }
    const compressed = bytes.readUInt32LE(cursor + 20);
    const decompressed = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    if (compressed === 0xffffffff || decompressed === 0xffffffff || local === 0xffffffff) zipMetadataError("ZIP64 is not supported");
    if (bytes.readUInt16LE(cursor + 34) !== 0) zipMetadataError("split-disk ZIP is not supported");
    if (nameLength > MAX_ZIP_PATH_BYTES) zipMetadataError("path limit exceeded (1024 bytes)");
    if (extraLength > MAX_ZIP_EXTRA_BYTES || commentLength > MAX_ZIP_COMMENT_BYTES) {
      zipMetadataError("extra field or entry comment limit exceeded (4096 bytes)");
    }
    if (compressed > MAX_COMPRESSED_BYTES) zipMetadataError("declared compressed entry limit exceeded (8 MiB)");
    if (decompressed > MAX_XML_BYTES) zipMetadataError("declared decompressed entry limit exceeded (16 MiB)");
    totalBytes += decompressed;
    totalCompressedBytes += compressed;
    if (totalBytes > MAX_ZIP_TOTAL_BYTES || totalCompressedBytes > MAX_COMPRESSED_BYTES) {
      zipMetadataError("total declared size limit exceeded (32 MiB decompressed, 8 MiB compressed)");
    }
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end) zipMetadataError("truncated central entry");
    checkZipExtra(bytes, cursor + 46 + nameLength, extraLength);
    if (local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50) {
      zipMetadataError("truncated or invalid local header offset");
    }
    const localCompressed = bytes.readUInt32LE(local + 18);
    const localDecompressed = bytes.readUInt32LE(local + 22);
    if (localCompressed === 0xffffffff || localDecompressed === 0xffffffff) zipMetadataError("ZIP64 is not supported");
    if (localCompressed > MAX_COMPRESSED_BYTES || localDecompressed > MAX_XML_BYTES) {
      zipMetadataError("local declared size limit exceeded (8 MiB compressed, 16 MiB decompressed)");
    }
    const localNameLength = bytes.readUInt16LE(local + 26);
    const localExtraLength = bytes.readUInt16LE(local + 28);
    if (localNameLength > MAX_ZIP_PATH_BYTES) zipMetadataError("local path limit exceeded (1024 bytes)");
    if (localExtraLength > MAX_ZIP_EXTRA_BYTES) zipMetadataError("local extra field limit exceeded (4096 bytes)");
    if (local + 30 + localNameLength + localExtraLength + compressed > centralStart) {
      zipMetadataError("truncated local entry data");
    }
    checkZipExtra(bytes, local + 30 + localNameLength, localExtraLength);
    cursor = next;
  }
  if (cursor !== end) zipMetadataError("central entry count or size mismatch");
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

/** Linear lexical preflight. It allocates no XML tree or attribute map. Syntax
 * validation still runs afterwards, on input with bounded structural cost.
 */
function checkXmlStructure(xml: string): void {
  let depth = 0;
  let elements = 0;
  let entities = 0;
  let links = 0;
  let attributes = 0;
  let cursor = 0;
  while ((cursor = xml.indexOf("<", cursor)) !== -1) {
    let terminator: string | undefined;
    if (xml.startsWith("<!--", cursor)) terminator = "-->";
    else if (xml.startsWith("<![CDATA[", cursor)) terminator = "]]>";
    if (terminator) {
      const end = xml.indexOf(terminator, cursor + terminator.length);
      if (end === -1) throw new Error("invalid GraphML: unterminated comment or CDATA");
      cursor = end + terminator.length;
      continue;
    }
    if (xml.startsWith("<!", cursor)) throw new Error("DTD declarations are not allowed in GraphML");
    const start = cursor;
    const closing = xml[cursor + 1] === "/";
    const instruction = xml[cursor + 1] === "?";
    let nameEnd = cursor + (closing ? 2 : 1);
    while (nameEnd < xml.length && !/[\s/>]/.test(xml[nameEnd])) {
      if (nameEnd - start > 65536) throw new Error("XML tag length limit exceeded (65536)");
      nameEnd++;
    }
    const name = xml.slice(cursor + (closing ? 2 : 1), nameEnd);
    let quote = "";
    let tagAttributes = 0;
    for (cursor = nameEnd; cursor < xml.length; cursor++) {
      if (cursor - start > 65536) throw new Error("XML tag length limit exceeded (65536)");
      const char = xml[cursor];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === "=") {
        if (++tagAttributes > 128 || ++attributes > 100_000) throw new Error("XML attribute limit exceeded (128 per tag, 100000 total)");
      } else if (char === ">" && (!instruction || xml[cursor - 1] === "?")) break;
    }
    if (cursor === xml.length) throw new Error("invalid GraphML: unterminated tag");
    if (!instruction) {
      if (closing) {
        if (--depth < 0) throw new Error("invalid GraphML: unexpected closing tag");
      } else {
        if (++elements > 100_000) throw new Error("XML element limit exceeded (100000)");
        if (name === "node" && ++entities > 10_000) throw new Error("entity limit exceeded (10000)");
        if (name === "edge" && ++links > 20_000) throw new Error("link limit exceeded (20000)");
        if (depth + 1 > 64) throw new Error("XML depth limit exceeded (64)");
        if (xml[cursor - 1] !== "/") depth++;
      }
    }
    cursor++;
  }
}

export async function readMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
  checkCompressedSize(bytes.byteLength);
  return withImportSlot(() => parseMtgxBytes(bytes, newGraphId));
}

async function parseMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
  checkZipMetadata(bytes);
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
  checkXmlStructure(xml);
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`invalid GraphML: ${validation.err.msg}`);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    maxNestedTags: 64,
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
