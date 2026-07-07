export class LookupTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "LookupTimeoutError";
  }
}

export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new LookupTimeoutError(label, timeoutMs));
    }, timeoutMs);

    operation.then(
      (value) => {
        if (timeout) clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
