import { describe, it, expect } from "vitest";
import { jsonToolResult } from "../../../src/tools/_shared.js";

describe("jsonToolResult", () => {
  it("returns content array with stringified JSON and the original details", () => {
    const result = jsonToolResult({ ok: true, count: 3 });
    expect(result.details).toEqual({ ok: true, count: 3 });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ ok: true, count: 3 }, null, 2) },
    ]);
  });

  it("handles non-object payloads", () => {
    const result = jsonToolResult("hello");
    expect(result.details).toBe("hello");
    expect(result.content[0].text).toBe('"hello"');
  });
});
