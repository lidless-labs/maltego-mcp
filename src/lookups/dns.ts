import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import type { LookupOutcome } from "../types.js";
import { LookupTimeoutError, withLookupTimeout } from "./timeout.js";

export interface DnsData {
  domain: string;
  a: string[];
  aaaa: string[];
  mx: { exchange: string; priority: number }[];
  ns: string[];
  txt: string[];
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export async function dnsLookup(
  domain: string,
  timeoutMs: number = 30_000,
): Promise<LookupOutcome<DnsData>> {
  try {
    const [a, aaaa, mx, ns, txt] = await withLookupTimeout(
      Promise.all([
        safe(resolve4(domain), [] as string[]),
        safe(resolve6(domain), [] as string[]),
        safe(resolveMx(domain), [] as { exchange: string; priority: number }[]),
        safe(resolveNs(domain), [] as string[]),
        safe(resolveTxt(domain), [] as string[][]),
      ]),
      timeoutMs,
      "dns lookup",
    );
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
    if (err instanceof LookupTimeoutError) {
      return { ok: false, error: err.message, retriable: true, retryAfterMs: timeoutMs };
    }
    return {
      ok: false,
      error: `dns lookup failed: ${(err as Error).message}`,
      retriable: true
    };
  }
}
