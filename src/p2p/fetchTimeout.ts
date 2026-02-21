export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const safeTimeoutMs = Math.max(1, timeoutMs);
  const timeoutSignal = getTimeoutSignal(safeTimeoutMs);
  try {
    return await fetch(url, { signal: timeoutSignal.signal });
  } finally {
    timeoutSignal.cleanup();
  }
}

export function isAbortError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError'
  );
}

function getTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => undefined };
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => globalThis.clearTimeout(timer)
  };
}
