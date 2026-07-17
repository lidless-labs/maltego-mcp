import { resolveTxt } from "node:dns/promises";
import type { LookupOutcome } from "../types.js";
import { LookupTimeoutError, withLookupTimeout } from "./timeout.js";

export interface AsnData {
  ip: string;
  asn: number;
  prefix: string;
  country: string;
  registry: string;
  allocated: string;
  organization?: string;
}

function reverseIPv4(ip: string): string {
  return ip.split(".").reverse().join(".");
}

async function performAsnLookup(ip: string): Promise<AsnData> {
  const reversed = reverseIPv4(ip);
  const originHost = `${reversed}.origin.asn.cymru.com`;
  const originRecords = await resolveTxt(originHost);
  const originText = originRecords[0]?.join("") ?? "";
  const [asnStr, prefix, country, registry, allocated] = originText
    .split("|")
    .map((s) => s.trim());
  const asn = parseInt(asnStr, 10);
  let organization: string | undefined;
  try {
    const asHost = `AS${asn}.asn.cymru.com`;
    const asRecords = await resolveTxt(asHost);
    const asText = asRecords[0]?.join("") ?? "";
    const parts = asText.split("|").map((s) => s.trim());
    organization = parts[4];
  } catch {
    organization = undefined;
  }
  return { ip, asn, prefix, country, registry, allocated, organization };
}

export async function asnLookup(
  ip: string,
  timeoutMs: number = 30_000,
): Promise<LookupOutcome<AsnData>> {
  try {
    const data = await withLookupTimeout(performAsnLookup(ip), timeoutMs, "asn lookup");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof LookupTimeoutError) {
      return { ok: false, error: err.message, retriable: true, retryAfterMs: timeoutMs };
    }
    return {
      ok: false,
      error: `asn lookup failed: ${(err as Error).message}`,
      retriable: true
    };
  }
}
