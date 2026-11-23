import { request, type Dispatcher } from "undici";
import type { LookupOutcome } from "../types.js";

const maxResponseBytes = 1024 * 1024;
const maxRows = 1000;
const maxSansPerRow = 128;
const maxTotalSans = 4096;
const maxStringLength = 4096;

export interface CrtshCert {
  id: number;
  commonName: string;
  issuer: string;
  sans: string[];
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  entryTimestamp: string;
}

export interface CrtshData {
  domain: string;
  certs: CrtshCert[];
}

interface CrtshResponseRow extends Record<string, unknown> {
  id: number;
  common_name: string;
  issuer_name: string;
  name_value: string;
  not_before: string;
  not_after: string;
  serial_number: string;
  entry_timestamp: string;
}

function cancelBody(body: Dispatcher.ResponseData["body"]): void {
  if (body.destroyed) return;
  // Undici emits an abort error when destroying an unread body.
  body.once("error", () => undefined);
  body.destroy();
}

function responseTooLarge(): LookupOutcome<never> {
  return { ok: false, error: "crt.sh response exceeds maximum size", retriable: false };
}

async function readBoundedBody({ body, headers }: Dispatcher.ResponseData): Promise<LookupOutcome<Buffer>> {
  const contentLength = headers["content-length"];
  if (typeof contentLength === "string") {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > maxResponseBytes) {
      cancelBody(body);
      return responseTooLarge();
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    for await (const chunk of body) {
      const bytes: Buffer = chunk;
      totalBytes += bytes.length;
      if (totalBytes > maxResponseBytes) {
        cancelBody(body);
        return responseTooLarge();
      }
      chunks.push(bytes);
    }
  } catch {
    return { ok: false, error: "crt.sh response body failed", retriable: false };
  }

  return { ok: true, data: Buffer.concat(chunks, totalBytes) };
}

function isCertificateRow(value: unknown): value is CrtshResponseRow {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Number.isFinite(row.id) && [
    row.common_name,
    row.issuer_name,
    row.name_value,
    row.not_before,
    row.not_after,
    row.serial_number,
    row.entry_timestamp,
  ].every((field) => typeof field === "string" && field.length <= maxStringLength);
}

function parseCertificates(bytes: Buffer): LookupOutcome<CrtshCert[]> {
  let rows: unknown;
  try {
    rows = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, error: "crt.sh returned invalid JSON", retriable: false };
  }
  if (!Array.isArray(rows)) {
    return { ok: false, error: "crt.sh returned invalid certificate list", retriable: false };
  }
  if (rows.length > maxRows) {
    return { ok: false, error: "crt.sh returned too many certificates", retriable: false };
  }

  const certs: CrtshCert[] = [];
  let totalSans = 0;
  for (const row of rows) {
    if (!isCertificateRow(row)) {
      return { ok: false, error: "crt.sh returned invalid certificate data", retriable: false };
    }
    const sans = row.name_value.split("\n").filter((san) => san.length > 0);
    totalSans += sans.length;
    if (sans.length > maxSansPerRow || totalSans > maxTotalSans) {
      return { ok: false, error: "crt.sh returned too many SANs", retriable: false };
    }
    certs.push({
      id: row.id,
      commonName: row.common_name,
      issuer: row.issuer_name,
      sans,
      notBefore: row.not_before,
      notAfter: row.not_after,
      serialNumber: row.serial_number,
      entryTimestamp: row.entry_timestamp,
    });
  }
  return { ok: true, data: certs };
}

export async function crtshLookup(domain: string, timeoutMs: number = 30_000): Promise<LookupOutcome<CrtshData>> {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  let res;
  try {
    res = await request(url, { method: "GET", headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  } catch (err) {
    return {
      ok: false,
      error: `crt.sh request failed: ${(err as Error).message}`,
      retriable: true
    };
  }

  if (res.statusCode >= 400) cancelBody(res.body);
  if (res.statusCode === 429) {
    const ra = res.headers["retry-after"];
    const seconds = typeof ra === "string" ? parseInt(ra, 10) : NaN;
    return {
      ok: false,
      error: "crt.sh rate limited",
      retriable: true,
      retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : timeoutMs
    };
  }
  if (res.statusCode >= 400) {
    return {
      ok: false,
      error: `crt.sh returned ${res.statusCode}`,
      retriable: res.statusCode >= 500
    };
  }

  const body = await readBoundedBody(res);
  if (!body.ok) return body;
  const certs = parseCertificates(body.data);
  if (!certs.ok) return certs;
  return { ok: true, data: { domain, certs: certs.data } };
}
