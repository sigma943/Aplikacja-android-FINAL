/** Start the backup promptly on failure or a slow primary; only accept a validated result. */
export function roadRouteWithFallback<T>(primary: () => Promise<T>, secondary: () => Promise<T>, delayMs = 1000, primaryGraceMs = 0): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let secondaryStarted = false;
    let failures = 0;
    let primaryFailed = false;
    let backup: {value:T} | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const accept = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (++failures < 2 || settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      reject(error);
    };
    const startSecondary = () => {
      if (settled || secondaryStarted) return;
      secondaryStarted = true;
      Promise.resolve().then(secondary).then(value => {
        if(settled)return;
        if(primaryFailed || primaryGraceMs<=0){accept(value);return;}
        backup={value};
        // A validated bus route wins over a car route during this bounded
        // grace period. A primary failure releases the ready backup at once.
        graceTimer=setTimeout(()=>accept(value),primaryGraceMs);
      }, fail);
    };
    const timer = setTimeout(startSecondary, delayMs);
    Promise.resolve().then(primary).then(accept, error => {
      primaryFailed=true;
      fail(error);
      if(backup){accept(backup.value);return;}
      startSecondary();
    });
  });
}
