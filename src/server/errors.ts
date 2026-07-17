export class ToolValidationError extends Error {
  constructor(message: string, readonly suggestions?: string[]) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class ToolFileSystemError extends Error {
  constructor(message: string, readonly path: string, readonly cause?: NodeJS.ErrnoException) {
    super(message);
    this.name = "ToolFileSystemError";
  }
}

export class ToolParseError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "ToolParseError";
  }
}

export function toToolResponse(err: unknown): {
  isError: true;
  content: { type: "text"; text: string }[];
  structuredContent: { error: Record<string, unknown> };
} {
  const details: Record<string, unknown> = err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: "UnknownError", message: String(err) };
  const extras: string[] = [];

  if (err instanceof ToolValidationError && err.suggestions?.length) {
    details.suggestions = err.suggestions;
    extras.push(`suggestions: ${err.suggestions.join(", ")}`);
  }
  if (err instanceof ToolFileSystemError) {
    details.path = err.path;
    extras.push(`path: ${err.path}`);
    if (err.cause) {
      const cause = {
        name: err.cause.name,
        message: err.cause.message,
        ...(err.cause.code ? { code: err.cause.code } : {}),
      };
      details.cause = cause;
      extras.push(`cause: ${err.cause.code ? `${err.cause.code}: ` : ""}${err.cause.message}`);
    }
  }
  if (err instanceof ToolParseError && err.path) {
    details.path = err.path;
    extras.push(`path: ${err.path}`);
  }

  const message = `${String(details.name)}: ${String(details.message)}${
    extras.length ? ` [${extras.join("; ")}]` : ""
  }`;
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: details },
  };
}
