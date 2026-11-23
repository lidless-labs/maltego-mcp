import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher, errors } from "undici";
import * as undici from "undici";
import { crtshLookup } from "../../../src/lookups/crtsh.js";

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof undici>();
  return { ...actual, request: vi.fn(actual.request) };
});

let originalDispatcher: Dispatcher;
let mockAgent: MockAgent;

const responseRow = {
  id: 1,
  common_name: "example.com",
  issuer_name: "test CA",
  name_value: "example.com",
  not_before: "",
  not_after: "",
  serial_number: "01",
  entry_timestamp: "",
};

beforeEach(() => {
  originalDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  vi.clearAllMocks();
  await mockAgent.close();
  setGlobalDispatcher(originalDispatcher);
});

describe("crtshLookup", () => {
  it("parses cert entries for a domain", async () => {
    const fixture = await readFile(
      resolve(__dirname, "../../../fixtures/responses/crtsh-example.com.json"),
      "utf8"
    );
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(200, fixture, { headers: { "content-type": "application/json" } });

    const result = await crtshLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.certs).toHaveLength(1);
      expect(result.data.certs[0].commonName).toBe("www.example.com");
      expect(result.data.certs[0].sans).toContain("*.example.com");
      expect(result.data.certs[0].sans).toContain("example.com");
    }
  });

  it("returns retriable error on 429", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(429, "", { headers: { "retry-after": "60" } });

    const result = await crtshLookup("example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retriable).toBe(true);
      expect(result.retryAfterMs).toBe(60_000);
    }
  });

  it("forwards timeoutMs to undici request options", async () => {
    let requestTimeouts: Pick<Dispatcher.DispatchOptions, "headersTimeout" | "bodyTimeout"> | undefined;
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(
        200,
        (opts) => {
          const dispatchOpts = opts as Dispatcher.DispatchOptions;
          requestTimeouts = {
            headersTimeout: dispatchOpts.headersTimeout,
            bodyTimeout: dispatchOpts.bodyTimeout,
          };
          return "[]";
        },
        { headers: { "content-type": "application/json" } },
      );

    await crtshLookup("example.com", 7777);

    expect(requestTimeouts?.headersTimeout).toBe(7777);
    expect(requestTimeouts?.bodyTimeout).toBe(7777);
  });

  it("uses the default lookup timeout when timeoutMs is omitted", async () => {
    let requestTimeouts: Pick<Dispatcher.DispatchOptions, "headersTimeout" | "bodyTimeout"> | undefined;
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(
        200,
        (opts) => {
          const dispatchOpts = opts as Dispatcher.DispatchOptions;
          requestTimeouts = {
            headersTimeout: dispatchOpts.headersTimeout,
            bodyTimeout: dispatchOpts.bodyTimeout,
          };
          return "[]";
        },
        { headers: { "content-type": "application/json" } },
      );

    await crtshLookup("example.com");

    expect(requestTimeouts?.headersTimeout).toBe(30_000);
    expect(requestTimeouts?.bodyTimeout).toBe(30_000);
  });

  it("maps undici HeadersTimeoutError to a retriable lookup error", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .replyWithError(new errors.HeadersTimeoutError());

    const result = await crtshLookup("example.com", 50);

    expect(result).toEqual({
      ok: false,
      error: "crt.sh request failed: Headers Timeout Error",
      retriable: true,
    });
  });

  it("maps undici BodyTimeoutError to a retriable lookup error", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .replyWithError(new errors.BodyTimeoutError());

    const result = await crtshLookup("example.com", 50);

    expect(result).toEqual({
      ok: false,
      error: "crt.sh request failed: Body Timeout Error",
      retriable: true,
    });
  });

  it("maps undici ConnectTimeoutError to a retriable lookup error", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .replyWithError(new errors.ConnectTimeoutError());

    const result = await crtshLookup("example.com", 50);

    expect(result).toEqual({
      ok: false,
      error: "crt.sh request failed: Connect Timeout Error",
      retriable: true,
    });
  });

  it("maps undici RequestAbortedError to a retriable lookup error", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .replyWithError(new errors.RequestAbortedError());

    const result = await crtshLookup("example.com");

    expect(result).toEqual({
      ok: false,
      error: "crt.sh request failed: Request aborted",
      retriable: true,
    });
  });

  it("does not forward an AbortSignal to undici request options", async () => {
    let requestSignal: Dispatcher.RequestOptions["signal"] | undefined;
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(
        200,
        (opts) => {
          requestSignal = (opts as Dispatcher.RequestOptions).signal;
          return "[]";
        },
        { headers: { "content-type": "application/json" } },
      );

    await crtshLookup("example.com");

    expect(requestSignal).toBeUndefined();
  });

  it("maps transport errors to retriable lookup errors", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .replyWithError(new Error("connect ECONNREFUSED 127.0.0.1:443"));

    const result = await crtshLookup("example.com");

    expect(result).toEqual({
      ok: false,
      error: "crt.sh request failed: connect ECONNREFUSED 127.0.0.1:443",
      retriable: true,
    });
  });

  it("uses timeoutMs as retryAfterMs when rate limited without retry-after", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(429, "");

    const result = await crtshLookup("example.com", 1234);

    expect(result).toEqual({
      ok: false,
      error: "crt.sh rate limited",
      retriable: true,
      retryAfterMs: 1234,
    });
  });

  it("returns a non-retriable error for client HTTP failures", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(404, "not found");

    const result = await crtshLookup("example.com");

    expect(result).toEqual({
      ok: false,
      error: "crt.sh returned 404",
      retriable: false,
    });
  });

  it("returns a non-retriable error for HTTP 400", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(400, "bad request");

    const result = await crtshLookup("example.com");

    expect(result).toEqual({
      ok: false,
      error: "crt.sh returned 400",
      retriable: false,
    });
  });

  it("returns a retriable error for server HTTP failures", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(503, "service unavailable");

    const result = await crtshLookup("example.com");

    expect(result).toEqual({
      ok: false,
      error: "crt.sh returned 503",
      retriable: true,
    });
  });

  it("returns a retriable error for HTTP 500", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(500, "internal server error");

    const result = await crtshLookup("example.com");

    expect(result).toEqual({
      ok: false,
      error: "crt.sh returned 500",
      retriable: true,
    });
  });

  it.each([
    ["invalid JSON", "not-json", "crt.sh returned invalid JSON"],
    ["a non-array response", "{}", "crt.sh returned invalid certificate list"],
    ["a null row", "[null]", "crt.sh returned invalid certificate data"],
    ["a wrong field type", JSON.stringify([{ ...responseRow, name_value: 1 }]), "crt.sh returned invalid certificate data"],
    ["a missing field", JSON.stringify([{ ...responseRow, serial_number: undefined }]), "crt.sh returned invalid certificate data"],
    ["a long field", JSON.stringify([{ ...responseRow, common_name: "a".repeat(4097) }]), "crt.sh returned invalid certificate data"],
    ["too many rows", JSON.stringify(Array(1001).fill(responseRow)), "crt.sh returned too many certificates"],
    ["too many SANs per row", JSON.stringify([{ ...responseRow, name_value: "a\n".repeat(129) }]), "crt.sh returned too many SANs"],
    ["too many SANs across rows", JSON.stringify(Array(33).fill({ ...responseRow, name_value: "a\n".repeat(125) })), "crt.sh returned too many SANs"],
  ])("returns a lookup error for %s", async (_label, body, error) => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(200, body);

    const outcome = await crtshLookup("example.com");
    expect(outcome.ok).toBe(false);
    expect(outcome).toEqual({ ok: false, error, retriable: false });
  });

  it.each([
    [429, {}, "crt.sh rate limited", true],
    [503, {}, "crt.sh returned 503", true],
    [200, { "content-length": "1048577" }, "crt.sh response exceeds maximum size", false],
  ] as const)("cancels an unread response body for HTTP %s", async (status, headers, error, retriable) => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(status, "[]", { headers });

    await expect(crtshLookup("example.com")).resolves.toMatchObject({ ok: false, error, retriable });
    const response = await vi.mocked(undici.request).mock.results[0].value;
    expect(response.body.destroyed).toBe(true);
  });

  it.each([
    [1_048_576, true],
    [1_048_577, false],
  ])("enforces the actual UTF-8 byte limit for %s bytes", async (size, ok) => {
    // Put two-byte characters in an ignored field of an otherwise valid response.
    const row = JSON.stringify([{ ...responseRow, extra: "" }]);
    const paddingBytes = size - Buffer.byteLength(row) - 3;
    const padding = "é".repeat(Math.floor(paddingBytes / 2)) + "a".repeat(paddingBytes % 2);
    const body = "\uFEFF" + row.replace('"extra":""', `"extra":"${padding}"`);
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(200, body);

    const outcome = await crtshLookup("example.com");
    expect(outcome.ok).toBe(ok);
    if (ok) {
      expect(outcome).toMatchObject({ ok: true, data: { certs: [{ id: 1 }] } });
    } else {
      expect(outcome).toEqual({ ok: false, error: "crt.sh response exceeds maximum size", retriable: false });
    }
  });
});
