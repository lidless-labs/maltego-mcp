export function jsonToolResult<T>(details: T): {
  content: Array<{ type: "text"; text: string }>;
  details: T;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}
