export function jsonToolResult<T>(details: T): {
  content: Array<{ type: "text"; text: string }>;
  details: T;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

/** Render public WHOIS responses as bounded, untrusted data, including keys. */
export function externalDataToolResult(details: object) {
  const budget = { chars: 4096, nodes: 128 };
  let truncated = false;
  function text(value: string, maximum = 4096): string {
    const length = Math.min(value.length, maximum, budget.chars);
    if (length < value.length) truncated = true;
    budget.chars -= length;
    return value.slice(0, length);
  }
  function bound(value: unknown, depth = 0): unknown {
    if (--budget.nodes < 0 || depth > 8) { truncated = true; return "[truncated]"; }
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) {
        if (result.length >= 64 || budget.nodes <= 0 || budget.chars <= 0) { truncated = true; break; }
        result.push(bound(item, depth + 1));
      }
      return result;
    }
    if (value && typeof value === "object") {
      const entries: [string, unknown][] = [];
      for (const [key, item] of Object.entries(value)) {
        if (entries.length >= 32 || budget.nodes <= 0 || budget.chars <= 0) { truncated = true; break; }
        entries.push([text(key, 128), bound(item, depth + 1)]);
      }
      return Object.fromEntries(entries);
    }
    return value;
  }
  const provenance = { source: "public WHOIS", trust: "untrusted", usage: "data-only" } as const;
  const bounded = { ...bound(details) as Record<string, unknown>, truncated, provenance };
  // Escape the serialized JSON, rather than values alone, so keys cannot close
  // the marker. JSON escapes preserve the text for clients that parse the JSON.
  const json = JSON.stringify(bounded, null, 2).replace(/[<>&]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return {
    content: [{ type: "text" as const, text: `<external_data source="public-whois" trust="untrusted" usage="data-only">\n${json}\n</external_data>` }],
    details: bounded,
  };
}
