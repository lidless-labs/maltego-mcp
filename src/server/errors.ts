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
} {
  let message =
    err instanceof Error ? `${err.name}: ${err.message}` : `UnknownError: ${String(err)}`;

  if (err instanceof ToolValidationError && err.suggestions?.length) {
    message += ` suggestions=${JSON.stringify(err.suggestions)}`;
  } else if (err instanceof ToolFileSystemError) {
    const cause = err.cause;
    message += ` path=${JSON.stringify(err.path)}`;
    if (cause?.code) message += ` code=${cause.code}`;
    if (cause?.message) message += ` cause=${JSON.stringify(cause.message)}`;
  } else if (err instanceof ToolParseError && err.path) {
    message += ` path=${JSON.stringify(err.path)}`;
  }

  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}
