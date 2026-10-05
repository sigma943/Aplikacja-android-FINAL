/** Also releases callers of native HTTP, whose underlying request cannot be aborted. */
export async function withRequestDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = 12_000,
): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    controller.abort();
    rejectAbort(new DOMException('Request aborted', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (signal?.aborted) abort();
    return await Promise.race([aborted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError');
      return run(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
