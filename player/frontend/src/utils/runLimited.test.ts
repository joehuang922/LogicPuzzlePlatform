import { describe, expect, it } from "vitest";
import { runLimited, withRetry } from "./runLimited";

const noSleep = () => Promise.resolve();

describe("runLimited", () => {
  it("never exceeds the limit and keeps input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (n === 4) throw new Error("four");
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([10, 20, 30, "x", 50, 60, 70]);
  });

  it("handles no items", async () => {
    expect(await runLimited([], 3, async () => 1)).toEqual([]);
  });
});

describe("withRetry", () => {
  it("retries server errors until success", async () => {
    let calls = 0;
    const v = await withRetry(async () => {
      if (++calls < 3) throw Object.assign(new Error("throttled"), { status: 500 });
      return "ok";
    }, 3, noSleep);
    expect([v, calls]).toEqual(["ok", 3]);
  });

  it("retries network errors and gives up after the retries", async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new TypeError("fetch failed"); }, 2, noSleep)).rejects.toThrow();
    expect(calls).toBe(3);
  });

  it("does not retry client errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw Object.assign(new Error("bad"), { status: 400 }); }, 3, noSleep),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
