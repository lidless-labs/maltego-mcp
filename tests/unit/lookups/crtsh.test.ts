import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher, errors } from "undici";
import { crtshLookup } from "../../../src/lookups/crtsh.js";

let originalDispatcher: Dispatcher;
let mockAgent: MockAgent;

beforeEach(() => {
  originalDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
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

  it.skip("returns a lookup error when crt.sh returns invalid JSON", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(200, "not-json", { headers: { "content-type": "application/json" } });

    const result = await crtshLookup("example.com");

    expect(result.ok).toBe(false);
  });
});
