import { createCreateGraphTool } from "./create-graph.js";
import { createAddEntityTool } from "./add-entity.js";
import { createAddLinkTool } from "./add-link.js";
import { createSaveGraphTool } from "./save-graph.js";
import { createLoadGraphTool } from "./load-graph.js";
import { createWhoisTool } from "./whois.js";
import { createDnsTool } from "./dns.js";
import { createAsnTool } from "./asn.js";
import { createCrtshTool } from "./crtsh.js";
import { createExpandIpTool } from "./expand-ip.js";
import { createExpandDomainTool } from "./expand-domain.js";
import { createExpandHashTool } from "./expand-hash.js";
import { createBuildIocGraphTool } from "./build-ioc-graph.js";

export {
  createCreateGraphTool,
  createAddEntityTool,
  createAddLinkTool,
  createSaveGraphTool,
  createLoadGraphTool,
  createWhoisTool,
  createDnsTool,
  createAsnTool,
  createCrtshTool,
  createExpandIpTool,
  createExpandDomainTool,
  createExpandHashTool,
  createBuildIocGraphTool,
};

export const ALL_TOOL_FACTORIES = [
  createCreateGraphTool,
  createAddEntityTool,
  createAddLinkTool,
  createSaveGraphTool,
  createLoadGraphTool,
  createWhoisTool,
  createDnsTool,
  createAsnTool,
  createCrtshTool,
  createExpandIpTool,
  createExpandDomainTool,
  createExpandHashTool,
  createBuildIocGraphTool,
] as const;

// Mapping of tool name → mcpInputShape (zod), used by the MCP entry to bind
// each tool with a typed input shape.
import { mcpInputShape as createGraphShape } from "./create-graph.js";
import { mcpInputShape as addEntityShape } from "./add-entity.js";
import { mcpInputShape as addLinkShape } from "./add-link.js";
import { mcpInputShape as saveGraphShape } from "./save-graph.js";
import { mcpInputShape as loadGraphShape } from "./load-graph.js";
import { mcpInputShape as whoisShape } from "./whois.js";
import { mcpInputShape as dnsShape } from "./dns.js";
import { mcpInputShape as asnShape } from "./asn.js";
import { mcpInputShape as crtshShape } from "./crtsh.js";
import { mcpInputShape as expandIpShape } from "./expand-ip.js";
import { mcpInputShape as expandDomainShape } from "./expand-domain.js";
import { mcpInputShape as expandHashShape } from "./expand-hash.js";
import { mcpInputShape as buildIocGraphShape } from "./build-ioc-graph.js";

export const MCP_INPUT_SHAPES: Record<string, Record<string, unknown>> = {
  maltego_create_graph: createGraphShape,
  maltego_add_entity: addEntityShape,
  maltego_add_link: addLinkShape,
  maltego_save_graph: saveGraphShape,
  maltego_load_graph: loadGraphShape,
  maltego_whois: whoisShape,
  maltego_dns: dnsShape,
  maltego_asn: asnShape,
  maltego_crtsh: crtshShape,
  maltego_expand_ip: expandIpShape,
  maltego_expand_domain: expandDomainShape,
  maltego_expand_hash: expandHashShape,
  maltego_build_ioc_graph: buildIocGraphShape,
};
