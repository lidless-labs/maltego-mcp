import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import type { LookupOutcome } from "../types.js";
import { withTimeout } from "./timeout.js";

export interface DnsData {
  domain: string;
  a: string[];
  aaaa: string[];
  mx: { exchange: string; priority: number }[];
  ns: string[];
  txt: string[];
}

async function safe<T>(promise: Promise<T>, fallback: T, timeoutMs: number, label: string): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, label);
  } catch {
    return fallback;
  }
}

export async function dnsLookup(domain: string, timeoutMs: number = 30_000): Promise<LookupOutcome<DnsData>> {
  try {
    const [a, aaaa, mx, ns, txt] = await Promise.all([
      safe(resolve4(domain), [] as string[], timeoutMs, `DNS A lookup for ${domain}`),
      safe(resolve6(domain), [] as string[], timeoutMs, `DNS AAAA lookup for ${domain}`),
      safe(resolveMx(domain), [] as { exchange: string; priority: number }[], timeoutMs, `DNS MX lookup for ${domain}`),
      safe(resolveNs(domain), [] as string[], timeoutMs, `DNS NS lookup for ${domain}`),
      safe(resolveTxt(domain), [] as string[][], timeoutMs, `DNS TXT lookup for ${domain}`)
    ]);
    return {
      ok: true,
      data: {
        domain,
        a,
        aaaa,
        mx,
        ns,
        txt: txt.flat()
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: `dns lookup failed: ${(err as Error).message}`,
      retriable: true
    };
  }
}
