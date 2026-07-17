import { describe, expect, it } from "vitest";
import {
  ToolFileSystemError,
  ToolParseError,
  ToolValidationError,
  toToolResponse,
} from "../../../src/server/errors.js";

describe("toToolResponse", () => {
  it("preserves validation suggestions in text and structured content", () => {
    const response = toToolResponse(
      new ToolValidationError("unknown entity type", ["IPv4Address", "Domain"]),
    );

    expect(response.content[0].text).toContain("suggestions: IPv4Address, Domain");
    expect(response.structuredContent).toEqual({
      error: {
        name: "ToolValidationError",
        message: "unknown entity type",
        suggestions: ["IPv4Address", "Domain"],
      },
    });
  });

  it("preserves filesystem path and safe cause fields", () => {
    const cause = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const response = toToolResponse(
      new ToolFileSystemError("write failed", "C:/graphs/out.mtgx", cause),
    );

    expect(response.content[0].text).toContain("path: C:/graphs/out.mtgx");
    expect(response.content[0].text).toContain("cause: ENOSPC: disk full");
    expect(response.structuredContent).toEqual({
      error: {
        name: "ToolFileSystemError",
        message: "write failed",
        path: "C:/graphs/out.mtgx",
        cause: { name: "Error", message: "disk full", code: "ENOSPC" },
      },
    });
  });

  it("preserves parse-error paths", () => {
    const response = toToolResponse(new ToolParseError("invalid zip", "bad.mtgx"));

    expect(response.structuredContent).toEqual({
      error: { name: "ToolParseError", message: "invalid zip", path: "bad.mtgx" },
    });
  });
});
