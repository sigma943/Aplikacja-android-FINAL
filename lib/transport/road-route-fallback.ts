/** Start the backup promptly on failure or a slow primary; only accept a validated result. */
export function roadRouteWithFallback<T>(primary: () => Promise<T>, secondary: () => Promise<T>, delayMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let secondaryStarted = false;
    let failures = 0;
    const accept = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (++failures < 2 || settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const startSecondary = () => {
      if (settled || secondaryStarted) return;
      secondaryStarted = true;
      Promise.resolve().then(secondary).then(accept, fail);
    };
    const timer = setTimeout(startSecondary, delayMs);
    Promise.resolve().then(primary).then(accept, error => {
      fail(error);
      startSecondary();
    });
  });
}
