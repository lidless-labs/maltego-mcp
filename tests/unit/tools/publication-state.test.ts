import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { Graph } from "../../../src/graph/graph.js";
import { saveGraphFile } from "../../../src/tools/_shared.js";
import { toToolResponse } from "../../../src/server/errors.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), unlink: vi.fn(actual.unlink), rmdir: vi.fn(actual.rmdir) };
});

describe("publication failure state", () => {
  let root: string;
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.open).mockReset().mockImplementation(actual.open);
    vi.mocked(fs.unlink).mockReset().mockImplementation(actual.unlink);
    vi.mocked(fs.rmdir).mockReset().mockImplementation(actual.rmdir);
    root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "maltego-publication-")));
  });
  afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

  const faults = process.platform === "linux"
    ? ["directory sync", "staging unlink", "staging removal"]
    : ["staging unlink", "staging removal"];
  it.each(faults)("reports an existing complete target after %s fails", async fault => {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    if (fault === "directory sync") {
      vi.mocked(fs.open).mockImplementation(async (path, flags, mode) => {
        const handle = await actual.open(path, flags, mode);
        if (typeof flags === "number" && (flags & constants.O_DIRECTORY)) {
          vi.spyOn(handle, "sync").mockRejectedValueOnce(new Error("injected directory sync failure"));
        }
        return handle;
      });
    } else if (fault === "staging unlink") {
      vi.mocked(fs.unlink).mockRejectedValueOnce(new Error("injected unlink failure"));
    } else {
      vi.mocked(fs.rmdir).mockRejectedValueOnce(new Error("injected removal failure"));
    }
    const path = join(root, "published.mtgx");
    const result = await Promise.allSettled([saveGraphFile(new Graph("g", "publication"), path, false)]);
    expect(result[0].status).toBe("rejected");
    const failure = (result[0] as PromiseRejectedResult).reason;
    const response = toToolResponse(failure);
    expect(response.structuredContent.error.publication_state).toBe("published");
    expect(response.structuredContent.error.path).toBe(path);
    expect(response.content[0].text).toContain("publication_state: published");
    expect((await JSZip.loadAsync(await fs.readFile(path))).file("Graphs/Graph1.graphml")).not.toBeNull();
    await expect(saveGraphFile(new Graph("retry", "retry"), path, false)).rejects.toMatchObject({ cause: { code: "EEXIST" } });
  });

  it("does not claim publication after the file sync fails", async () => {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.open).mockImplementation(async (path, flags, mode) => {
      const handle = await actual.open(path, flags, mode);
      if (typeof flags === "number" && (flags & constants.O_CREAT)) {
        vi.spyOn(handle, "sync").mockRejectedValueOnce(new Error("injected file sync failure"));
      }
      return handle;
    });
    const path = join(root, "unpublished.mtgx");
    const result = await Promise.allSettled([saveGraphFile(new Graph("g", "publication"), path, false)]);
    expect(result[0].status).toBe("rejected");
    const response = toToolResponse((result[0] as PromiseRejectedResult).reason);
    expect(response.structuredContent.error.publication_state).toBeUndefined();
    await expect(fs.stat(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
