import { describe, it, expect, vi } from "vitest";

// The OpenClaw plugin SDK isn't available as an npm dependency — it's
// resolved by the OpenClaw runtime at plugin load time. For the unit test
// we mock definePluginEntry to act as identity, so we can call the default
// export's register() against a fake api.
vi.mock("openclaw/plugin-sdk/plugin-entry", () => ({
  definePluginEntry: <T>(x: T) => x,
}));

import pluginEntry from "../../index.js";

describe("OpenClaw plugin entry", () => {
  it("declares the expected id and name", () => {
    expect(pluginEntry.id).toBe("maltego");
    expect(pluginEntry.name).toBe("Maltego");
  });

  it("register() with full mode wires 13 tools", () => {
    const registered: Array<{ name: string }> = [];
    const fakeApi = {
      registrationMode: "full" as const,
      pluginConfig: {} as Record<string, unknown>,
      registerTool: (t: { name: string }) => { registered.push(t); },
    };
    pluginEntry.register(fakeApi as unknown as Parameters<typeof pluginEntry.register>[0]);
    expect(registered.length).toBe(13);
    expect(registered.map((t) => t.name).sort()).toContain("maltego_create_graph");
  });

  it("register() with discovery mode wires zero tools", () => {
    const registered: Array<unknown> = [];
    const fakeApi = {
      registrationMode: "discovery" as const,
      pluginConfig: {},
      registerTool: (t: unknown) => { registered.push(t); },
    };
    pluginEntry.register(fakeApi as unknown as Parameters<typeof pluginEntry.register>[0]);
    expect(registered.length).toBe(0);
  });
});
