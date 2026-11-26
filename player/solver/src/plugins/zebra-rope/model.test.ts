import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gate } from "../../gate";
import { ZebraRopeCanon } from "./model";

describe("zebra rope gate", () => {
  it("solves a tiny board uniquely", () => {
    // 1x3: black circle between (0,0) and (0,1) -> both shaded; an alternating rope
    // would then be impossible, so the rope over all three is all shaded.
    const canon: ZebraRopeCanon = {
      width: 3,
      height: 1,
      ropes: [[[0, 0], [0, 1], [0, 2]]],
      circles: [{ dr: 1, dc: 2, color: 1 }],
    };
    expect(gate(36, canon)).toEqual({ verdict: "unique", solution: { states: [[1, 1, 1]] } });
  });

  it("agrees with brute force on random small boards", () => {
    // Every 3x3 shading checked by the rules directly, against the gate's verdict.
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor((seed / 2147483648) * n);
    };
    const w = 3;
    const h = 3;
    const seen = new Set<string>();
    for (let trial = 0; trial < 500; trial++) {
      // Odd trials plant a shading and keep only clues it satisfies (mostly unique or
      // multiple); even trials take random clues (mostly none or multiple).
      const planted = trial % 2 === 1 ? rand(1 << (w * h)) : -1;
      const bit = (r: number, c: number) => (planted >> (r * w + c)) & 1;
      const ropes: number[][][] = [];
      for (let k = 1 + rand(3); k > 0; k--) {
        const rope = [[rand(h), rand(w)]];
        for (let len = 1 + rand(4); len > 0; len--) {
          const [r, c] = rope[rope.length - 1];
          const [nr, nc] = [r + rand(3) - 1, c + rand(3) - 1];
          if (nr < 0 || nc < 0 || nr >= h || nc >= w || rope.some(([a, b]) => a === nr && b === nc)) continue;
          rope.push([nr, nc]);
        }
        const steps = rope.slice(1).map(([r, c], i) => bit(r, c) ^ bit(rope[i][0], rope[i][1]));
        if (rope.length >= 2 && (planted < 0 || steps.every((x) => x === steps[0]))) ropes.push(rope);
      }
      const circles: ZebraRopeCanon["circles"] = [];
      const taken = new Set<string>();
      for (let k = 4 + rand(8); k > 0; k--) {
        const dr = 1 + rand(2 * h - 1);
        const dc = 1 + rand(2 * w - 1);
        if ((dr % 2 === 1 && dc % 2 === 1) || taken.has(`${dr},${dc}`)) continue;
        taken.add(`${dr},${dc}`);
        let color = rand(3);
        if (planted >= 0) {
          const rows = dr % 2 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
          const cols = dc % 2 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
          let s = 0;
          let n = 0;
          for (const r of rows) for (const c of cols) (s += bit(r, c)), n++;
          color = 2 * s < n ? 0 : 2 * s > n ? 1 : 2;
        }
        circles.push({ dr, dc, color });
      }
      const canon: ZebraRopeCanon = { width: w, height: h, ropes, circles };
      const solutions: number[][][] = [];
      for (let mask = 0; mask < 1 << (w * h); mask++) {
        const at = (r: number, c: number) => (mask >> (r * w + c)) & 1;
        const ropesOk = ropes.every((rope) => {
          const d = rope.slice(1).map(([r, c], i) => at(r, c) ^ at(rope[i][0], rope[i][1]));
          return d.every((x) => x === d[0]);
        });
        const circlesOk = circles.every(({ dr, dc, color }) => {
          const rows = dr % 2 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
          const cols = dc % 2 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
          let s = 0;
          let n = 0;
          for (const r of rows) for (const c of cols) (s += at(r, c)), n++;
          return color === 0 ? s < n - s : color === 1 ? s > n - s : s === n - s;
        });
        if (ropesOk && circlesOk) solutions.push(Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => at(r, c))));
      }
      const result = gate(36, canon);
      const want = solutions.length === 0 ? "none" : solutions.length === 1 ? "unique" : "multiple";
      seen.add(want);
      expect(result?.verdict, JSON.stringify(canon)).toBe(want);
      if (want === "unique") expect(result?.solution).toEqual({ states: solutions[0] });
    }
    expect([...seen].sort()).toEqual(["multiple", "none", "unique"]);
  });

  it("reports no solution", () => {
    const canon: ZebraRopeCanon = {
      width: 3,
      height: 1,
      ropes: [[[0, 0], [0, 1], [0, 2]]],
      circles: [
        { dr: 1, dc: 2, color: 1 },
        { dr: 1, dc: 4, color: 0 },
      ],
    };
    expect(gate(36, canon)?.verdict).toBe("none");
  });
});

describe("zebra rope gate on the docs samples", () => {
  const docs = resolve(__dirname, "../../../../../docs/zebra-rope");
  for (const n of [1, 2]) {
    it(`board-zebra-rope-${n} has exactly the documented solution`, () => {
      const canon = JSON.parse(readFileSync(resolve(docs, `board-zebra-rope-${n}.canon.json`), "utf8"));
      const states = JSON.parse(readFileSync(resolve(docs, `board-zebra-rope-${n}.solution.json`), "utf8"));
      expect(gate(36, canon, { deadline: Date.now() + 30_000 })).toEqual({ verdict: "unique", solution: { states } });
    });
  }
});
