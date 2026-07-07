import { describe, expect, it } from "vitest";
import {
  ToolFileSystemError,
  ToolParseError,
  ToolValidationError,
  toToolResponse,
} from "../../../src/server/errors.js";

describe("toToolResponse", () => {
  it("includes validation suggestions", () => {
    const response = toToolResponse(new ToolValidationError("bad entity", ["Use Domain"]));
    expect(response.content[0].text).toContain("ToolValidationError: bad entity");
    expect(response.content[0].text).toContain("suggestions");
    expect(response.content[0].text).toContain("Use Domain");
  });

  it("includes filesystem path and cause", () => {
    const cause = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const response = toToolResponse(new ToolFileSystemError("write failed", "/tmp/out.mtgx", cause));
    expect(response.content[0].text).toContain("path=\"/tmp/out.mtgx\"");
    expect(response.content[0].text).toContain("code=ENOSPC");
    expect(response.content[0].text).toContain("disk full");
  });

  it("includes parse path", () => {
    const response = toToolResponse(new ToolParseError("invalid mtgx", "/tmp/bad.mtgx"));
    expect(response.content[0].text).toContain("path=\"/tmp/bad.mtgx\"");
  });
});
