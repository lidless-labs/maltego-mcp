import JSZip from "jszip";
import { constants } from "node:fs";
import { open, mkdir, mkdtemp, lstat, realpath, rmdir, link, rename, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, resolve, sep, parse, relative, join } from "node:path";
import { XMLBuilder } from "fast-xml-parser";
import type { Graph } from "./graph.js";
import { valuePropertyForEntityType } from "./entities.js";
import type { Entity, Link } from "../types.js";

function maltegoProperty(
  name: string,
  displayName: string,
  type: string,
  value: string
) {
  return {
    "@_name": name,
    "@_displayName": displayName,
    "@_type": type,
    "@_nullable": "true",
    "@_hidden": "false",
    "@_readonly": "false",
    "mtg:Value": value
  };
}

function entityToNode(entity: Entity) {
  const valueProperty = valuePropertyForEntityType(entity.type);
  const props: unknown[] = [
    maltegoProperty(valueProperty, "Value", "string", entity.value)
  ];

  for (const [k, v] of Object.entries(entity.properties)) {
    if (k === valueProperty) continue;
    props.push(maltegoProperty(k, k, "string", v));
  }

  return {
    "@_id": entity.id,
    "data": [
      {
        "@_key": "d4",
        "mtg:MaltegoEntity": {
          "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx",
          "@_type": entity.type,
          "mtg:Properties": { "mtg:Property": props }
        }
      },
      {
        "@_key": "d5",
        "mtg:EntityRenderer": {
          "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx",
          "mtg:Position": {
            "@_x": entity.position?.x ?? 0,
            "@_y": entity.position?.y ?? 0
          }
        }
      }
    ]
  };
}

function linkToEdge(link: Link) {
  const props: unknown[] = [
    maltegoProperty(
      "maltego.link.show-label",
      "Show Label",
      "int",
      link.label ? "1" : "0"
    ),
    maltegoProperty(
      "maltego.link.manual.type",
      "Label",
      "string",
      link.label ?? ""
    )
  ];

  for (const [k, v] of Object.entries(link.properties)) {
    if (k === "maltego.link.show-label" || k === "maltego.link.manual.type") continue;
    props.push(maltegoProperty(k, k, "string", v));
  }

  return {
    "@_id": link.id,
    "@_source": link.from,
    "@_target": link.to,
    "data": [
      {
        "@_key": "d6",
        "mtg:MaltegoLink": {
          "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx",
          "@_type": "maltego.link.manual-link",
          "mtg:Properties": { "mtg:Property": props }
        }
      },
      {
        "@_key": "d7",
        "mtg:LinkRenderer": {
          "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx"
        }
      }
    ]
  };
}

export async function writeMtgxBytes(graph: Graph): Promise<Uint8Array> {
  graph.applyLayout();
  const entities = graph.allEntities();
  const links = graph.allLinks();

  const doc = {
    "?xml": {
      "@_version": "1.0",
      "@_encoding": "UTF-8",
      "@_standalone": "no"
    },
    graphml: {
      "@_xmlns": "http://graphml.graphdrawing.org/xmlns",
      "@_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@_xmlns:y": "http://www.yworks.com/xml/graphml",
      "@_xsi:schemaLocation":
        "http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd",
      VersionInfo: {
        "@_createdBy": "Maltego Graph",
        "@_subtitle": "",
        "@_version": "4.11"
      },
      key: [
        { "@_for": "graphml", "@_id": "d0", "@_yfiles.type": "resources" },
        { "@_for": "port", "@_id": "d1", "@_yfiles.type": "portgraphics" },
        { "@_for": "port", "@_id": "d2", "@_yfiles.type": "portgeometry" },
        { "@_for": "port", "@_id": "d3", "@_yfiles.type": "portuserdata" },
        { "@_attr.name": "MaltegoEntity", "@_for": "node", "@_id": "d4" },
        { "@_for": "node", "@_id": "d5", "@_yfiles.type": "nodegraphics" },
        { "@_attr.name": "MaltegoLink", "@_for": "edge", "@_id": "d6" },
        { "@_for": "edge", "@_id": "d7", "@_yfiles.type": "edgegraphics" }
      ],
      graph: {
        "@_id": "G",
        "@_edgedefault": "directed",
        node: entities.map(entityToNode),
        edge: links.map(linkToEdge)
      },
      data: {
        "@_key": "d0",
        "y:Resources": ""
      }
    }
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: false,
    suppressBooleanAttributes: false
  });
  const xml = builder.build(doc);

  const zip = new JSZip();
  zip.folder("Graphs");
  zip.file("Graphs/Graph1.graphml", xml);
  zip.file("version.properties", "maltego.graph.version=1.3\nmaltego.client.version=4.11\n");
  return zip.generateAsync({ type: "uint8array" });
}

/** Linux pins parents through procfs. Other platforms use checked paths inside
 * an operator-controlled directory tree. Neither isolates hostile same-user code.
 */
async function openOutputDirectory(path: string): Promise<FileHandle | null> {
  if (process.platform !== "linux") {
    const absolute = resolve(path);
    let current = parse(absolute).root;
    for (const component of relative(current, absolute).split(sep).filter(Boolean)) {
      current = join(current, component);
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("output parent must be a directory without symlinks");
    }
    // Resolve only after rejecting symlinks, before creating the private stage.
    if (relative(absolute, await realpath(absolute)) !== "") throw new Error("output parent changed during validation");
    return null;
  }
  let directory = await open("/", constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    for (const component of resolve(path).split(sep).filter(Boolean)) {
      const child = `/proc/self/fd/${directory.fd}/${component}`;
      try { await mkdir(child, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const next = await open(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await directory.close();
      directory = next;
    }
    return directory;
  } catch (error) {
    await directory.close();
    throw error;
  }
}

export async function writeMtgxFile(
  graph: Graph,
  path: string,
  options: { overwrite?: boolean } = {},
): Promise<void> {
  const bytes = await writeMtgxBytes(graph);
  const directory = await openOutputDirectory(dirname(path));
  const parent = directory ? `/proc/self/fd/${directory.fd}` : resolve(dirname(path));
  const target = join(parent, basename(path));
  let staging: string | undefined;
  let stagingDirectory: FileHandle | undefined;
  let file: FileHandle | undefined;
  let temporary: string | undefined;
  try {
    // mkdtemp creates a private 0700 directory on POSIX. Windows relies on the
    // operator-controlled root's inherited ACL. A 0600 file in a shared directory
    // alone would not prevent another directory writer from substituting it.
    staging = await mkdtemp(join(parent, ".mtgx-"));
    if (directory) stagingDirectory = await open(staging, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const stageParent = stagingDirectory ? `/proc/self/fd/${stagingDirectory.fd}` : staging;
    temporary = join(stageParent, "graph.mtgx");
    const noFollow = process.platform === "linux" ? constants.O_NOFOLLOW : 0;
    file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    await file.writeFile(bytes);
    await file.sync();
    const written = await file.stat();
    const source = await lstat(temporary);
    if (!source.isFile() || source.dev !== written.dev || source.ino !== written.ino || source.size !== written.size) {
      throw new Error("staging source changed before publication");
    }
    // Close before rename for Windows compatibility. The private directory and
    // trusted ancestors protect the source pathname throughout publication.
    await file.close();
    file = undefined;
    if (options.overwrite ?? true) {
      await rename(temporary, target);
    } else {
      // Atomic exclusive publication, even when another save wins the race.
      await link(temporary, target);
    }
    if (directory) await directory.sync();
  } finally {
    try {
      if (file) await file.close();
      if (temporary) {
        try { await unlink(temporary); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    } finally {
      try {
        if (stagingDirectory) await stagingDirectory.close();
        if (staging) await rmdir(staging);
      } finally { if (directory) await directory.close(); }
    }
  }
}
