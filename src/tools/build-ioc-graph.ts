import { access } from "node:fs/promises";
import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import { Graph } from "../graph/graph.js";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { writeMtgxFile } from "../graph/writer.js";
import { confineToOutputDir } from "../server/paths.js";
import { ToolFileSystemError, ToolValidationError } from "../server/errors.js";
import { jsonToolResult } from "./_shared.js";

const StringRecord = Type.Record(Type.String(), Type.String());
const StringOrNumber = Type.Union([Type.String(), Type.Number()]);

const IocSchema = Type.Object(
  {
    type: Type.String({ description: "Maltego entity type, for example Domain, IPv4Address, Hash, or EmailAddress." }),
    value: Type.String(),
    properties: Type.Optional(StringRecord),
  },
  { additionalProperties: false },
);

const MispEventSchema = Type.Object(
  {
    id: Type.Optional(StringOrNumber),
    title: Type.Optional(Type.String()),
    info: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    properties: Type.Optional(StringRecord),
  },
  { additionalProperties: false },
);

const TheHiveCaseSchema = Type.Object(
  {
    id: Type.Optional(StringOrNumber),
    title: Type.Optional(Type.String()),
    severity: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    properties: Type.Optional(StringRecord),
  },
  { additionalProperties: false },
);

const CortexReportSchema = Type.Object(
  {
    analyzer: Type.Optional(Type.String()),
    verdict: Type.Optional(Type.String()),
    summary: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    properties: Type.Optional(StringRecord),
  },
  { additionalProperties: false },
);

const AttackTechniqueSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.Optional(Type.String()),
    tactic: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    properties: Type.Optional(StringRecord),
  },
  { additionalProperties: false },
);

const Schema = Type.Object(
  {
    ioc: IocSchema,
    outputPath: Type.String({ description: "Output path. Resolved relative to outputDir; absolute paths must be inside outputDir." }),
    title: Type.Optional(Type.String()),
    overwrite: Type.Optional(Type.Boolean()),
    maxItemsPerSection: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    mispEvents: Type.Optional(Type.Array(MispEventSchema)),
    thehiveCases: Type.Optional(Type.Array(TheHiveCaseSchema)),
    cortexReports: Type.Optional(Type.Array(CortexReportSchema)),
    attackTechniques: Type.Optional(Type.Array(AttackTechniqueSchema)),
    notes: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

const zStringRecord = z.record(z.string(), z.string());

export const mcpInputShape = {
  ioc: z.object({
    type: z.string().describe("Maltego entity type, for example Domain, IPv4Address, Hash, or EmailAddress."),
    value: z.string(),
    properties: zStringRecord.optional(),
  }),
  outputPath: z.string().describe("Output path. Resolved relative to outputDir; absolute paths must be inside outputDir."),
  title: z.string().optional(),
  overwrite: z.boolean().optional(),
  maxItemsPerSection: z.number().min(1).max(100).optional(),
  mispEvents: z.array(z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    info: z.string().optional(),
    url: z.string().optional(),
    properties: zStringRecord.optional(),
  })).optional(),
  thehiveCases: z.array(z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    severity: z.string().optional(),
    status: z.string().optional(),
    url: z.string().optional(),
    properties: zStringRecord.optional(),
  })).optional(),
  cortexReports: z.array(z.object({
    analyzer: z.string().optional(),
    verdict: z.string().optional(),
    summary: z.string().optional(),
    url: z.string().optional(),
    properties: zStringRecord.optional(),
  })).optional(),
  attackTechniques: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    tactic: z.string().optional(),
    url: z.string().optional(),
    properties: zStringRecord.optional(),
  })).optional(),
  notes: z.array(z.string()).optional(),
};

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

const COLUMN_SPACING = 300;
const ROW_SPACING = 130;
const DEFAULT_MAX_ITEMS = 12;

async function ensureWritable(path: string, overwrite: boolean): Promise<void> {
  if (overwrite) return;
  try { await access(path); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  throw new ToolFileSystemError(
    `file already exists, refusing to overwrite (pass overwrite=true): ${path}`,
    path,
  );
}

function stringValue(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function cleanProperties(properties: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, string>;
}

function valueWithFallback(primary: string | undefined, fallback: string): string {
  const trimmed = primary?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function takeVisible<T>(items: T[] | undefined, maxItems: number): { visible: T[]; omitted: number } {
  const all = items ?? [];
  return {
    visible: all.slice(0, maxItems),
    omitted: Math.max(0, all.length - maxItems),
  };
}

function addOmittedNode(graph: Graph, rootId: string, section: string, omitted: number, x: number, y: number): void {
  if (omitted <= 0) return;
  const node = graph.addEntity({
    type: "Phrase",
    value: `[${section}] ${omitted} more result${omitted === 1 ? "" : "s"} omitted`,
    properties: { reason: "maxItemsPerSection limit" },
    position: { x, y },
  });
  graph.addLink({ from: rootId, to: node.id, label: "omitted", properties: {} });
}

function addNotes(graph: Graph, rootId: string, notes: string[] | undefined, maxItems: number): number {
  const { visible, omitted } = takeVisible(notes, maxItems);
  let row = 0;
  for (const note of visible) {
    const node = graph.addEntity({
      type: "Phrase",
      value: `[Note] ${note}`,
      properties: { source: "operator" },
      position: { x: COLUMN_SPACING, y: row * ROW_SPACING },
    });
    graph.addLink({ from: rootId, to: node.id, label: "note", properties: {} });
    row += 1;
  }
  addOmittedNode(graph, rootId, "Notes", omitted, COLUMN_SPACING, row * ROW_SPACING);
  return visible.length + (omitted > 0 ? 1 : 0);
}

export function buildIocGraph(input: Input): Graph {
  if (!input.ioc?.type || !input.ioc.value) {
    throw new ToolValidationError("ioc.type and ioc.value are required");
  }

  const graph = new Graph("g-ioc-bridge", input.title ?? `ioc-${input.ioc.value}`);
  const maxItems = input.maxItemsPerSection ?? DEFAULT_MAX_ITEMS;
  const root = graph.addEntity({
    type: input.ioc.type,
    value: input.ioc.value,
    properties: input.ioc.properties ?? {},
    position: { x: 0, y: 260 },
  });

  let middleRow = addNotes(graph, root.id, input.notes, maxItems);

  const misp = takeVisible(input.mispEvents, maxItems);
  for (const event of misp.visible) {
    const eventId = stringValue(event.id);
    const label = valueWithFallback(event.title ?? event.info, eventId ? `Event #${eventId}` : "MISP event");
    const node = graph.addEntity({
      type: "Phrase",
      value: `[MISP] ${label}`,
      properties: cleanProperties({
        platform: "MISP",
        eventId,
        info: event.info,
        url: event.url,
        ...event.properties,
      }),
      position: { x: COLUMN_SPACING, y: middleRow * ROW_SPACING },
    });
    graph.addLink({ from: root.id, to: node.id, label: "appears in", properties: {} });
    middleRow += 1;
  }
  addOmittedNode(graph, root.id, "MISP", misp.omitted, COLUMN_SPACING, middleRow * ROW_SPACING);
  if (misp.omitted > 0) middleRow += 1;

  const cases = takeVisible(input.thehiveCases, maxItems);
  for (const item of cases.visible) {
    const caseId = stringValue(item.id);
    const label = valueWithFallback(item.title, caseId ? `Case #${caseId}` : "TheHive case");
    const node = graph.addEntity({
      type: "Phrase",
      value: `[TheHive] ${label}`,
      properties: cleanProperties({
        platform: "TheHive",
        caseId,
        severity: item.severity,
        status: item.status,
        url: item.url,
        ...item.properties,
      }),
      position: { x: COLUMN_SPACING, y: middleRow * ROW_SPACING },
    });
    graph.addLink({ from: root.id, to: node.id, label: "case", properties: {} });
    middleRow += 1;
  }
  addOmittedNode(graph, root.id, "TheHive", cases.omitted, COLUMN_SPACING, middleRow * ROW_SPACING);
  if (cases.omitted > 0) middleRow += 1;

  const reports = takeVisible(input.cortexReports, maxItems);
  for (const report of reports.visible) {
    const analyzer = valueWithFallback(report.analyzer, "Cortex analyzer");
    const verdict = valueWithFallback(report.verdict, "reported");
    const node = graph.addEntity({
      type: "Phrase",
      value: `[Cortex] ${analyzer} - ${verdict}`,
      properties: cleanProperties({
        platform: "Cortex",
        analyzer,
        verdict,
        summary: report.summary,
        url: report.url,
        ...report.properties,
      }),
      position: { x: COLUMN_SPACING, y: middleRow * ROW_SPACING },
    });
    graph.addLink({ from: root.id, to: node.id, label: "analyzed by", properties: {} });
    middleRow += 1;
  }
  addOmittedNode(graph, root.id, "Cortex", reports.omitted, COLUMN_SPACING, middleRow * ROW_SPACING);
  if (reports.omitted > 0) middleRow += 1;

  const techniques = takeVisible(input.attackTechniques, maxItems);
  for (let i = 0; i < techniques.visible.length; i += 1) {
    const technique = techniques.visible[i];
    const label = technique.name ? `[${technique.id}] ${technique.name}` : `[${technique.id}]`;
    const node = graph.addEntity({
      type: "Phrase",
      value: label,
      properties: cleanProperties({
        matrix: "MITRE ATT&CK",
        techniqueId: technique.id,
        tactic: technique.tactic,
        url: technique.url,
        ...technique.properties,
      }),
      position: { x: COLUMN_SPACING * 2, y: i * ROW_SPACING },
    });
    graph.addLink({ from: root.id, to: node.id, label: "mapped technique", properties: {} });
  }
  addOmittedNode(graph, root.id, "ATT&CK", techniques.omitted, COLUMN_SPACING * 2, techniques.visible.length * ROW_SPACING);

  return graph;
}

export function createBuildIocGraphTool(deps: ToolDeps) {
  return {
    name: "maltego_build_ioc_graph",
    label: "maltego: build IOC graph",
    description:
      "Build a .mtgx investigation graph from one IOC plus enrichment summaries gathered from MISP, TheHive, Cortex, MITRE, or other MCPs. This tool does not call those services itself.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const graph = buildIocGraph(input);
      deps.registry.register(graph);
      const outPath = confineToOutputDir(input.outputPath, deps.config.outputDir);
      await ensureWritable(outPath, input.overwrite ?? false);
      await writeMtgxFile(graph, outPath);
      return jsonToolResult({
        graphId: graph.id,
        path: outPath,
        entityCount: graph.entityCount(),
        linkCount: graph.linkCount(),
      });
    },
  };
}
