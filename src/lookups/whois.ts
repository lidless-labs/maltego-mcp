import { lookup as whoisLookupFn } from "whois";
import type { LookupOutcome } from "../types.js";
import { withTimeout } from "./timeout.js";

export interface WhoisData {
  domain: string;
  raw: string;
  registrar?: string;
  nameservers: string[];
  creationDate?: string;
  updatedDate?: string;
  registryExpiryDate?: string;
}

function extract(line: RegExp, text: string): string | undefined {
  const m = text.match(line);
  return m ? m[1].trim() : undefined;
}

function extractAll(line: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(line)) {
    out.push(match[1].trim());
  }
  return out;
}

function rawWhoisLookup(domain: string): Promise<WhoisData> {
  return new Promise((resolvePromise, reject) => {
    whoisLookupFn(domain, (err: Error | null, data: string) => {
      if (err) {
        reject(err);
        return;
      }
      const text = data ?? "";
      resolvePromise({
        domain,
        raw: text,
        registrar: extract(/^\s*Registrar:\s*(.+)$/im, text),
        nameservers: extractAll(/^\s*Name Server:\s*(.+)$/gim, text).map((s) => s.toUpperCase()),
        creationDate: extract(/^\s*Creation Date:\s*(.+)$/im, text),
        updatedDate: extract(/^\s*Updated Date:\s*(.+)$/im, text),
        registryExpiryDate: extract(/^\s*Registry Expiry Date:\s*(.+)$/im, text)
      });
    });
  });
}

export async function whoisLookup(domain: string, timeoutMs: number = 30_000): Promise<LookupOutcome<WhoisData>> {
  try {
    return {
      ok: true,
      data: await withTimeout(rawWhoisLookup(domain), timeoutMs, `whois lookup for ${domain}`),
    };
  } catch (err) {
    return {
      ok: false,
      error: `whois lookup failed: ${(err as Error).message}`,
      retriable: true
    };
  }
}
