export class LookupTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "LookupTimeoutError";
  }
}

export async function withLookupTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new LookupTimeoutError(label, timeoutMs)), timeoutMs);
    timer.unref?.();
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
