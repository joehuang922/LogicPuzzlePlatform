/**
 * Run `task` over `items` with at most `limit` in flight, settling every one (like
 * Promise.allSettled, in input order). The API's Lambdas share an account-wide
 * concurrency cap of 10, so firing dozens of requests at once gets most of them
 * throttled; bulk admin actions go through here instead.
 */
export async function runLimited<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await task(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Retry `task` on a server-side failure (5xx, including a throttled Lambda, or no
 * response at all), backing off 1s, 2s, 4s. Only for idempotent requests. A 4xx is
 * the request's own fault and is thrown at once.
 */
export async function withRetry<R>(
  task: () => Promise<R>,
  retries = 3,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      const status = (err as { status?: unknown })?.status;
      const clientError = typeof status === "number" && status < 500;
      if (clientError || attempt >= retries) throw err;
      await sleep(1000 * 2 ** attempt);
    }
  }
}
