import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { LitsModel, LitsCanon } from "./model";
import { canonFromRegions, isValidSolution, UNIQUE, MULTIPLE, NONE } from "./fixtures";

const model = (canon = UNIQUE) => LitsModel.fromCanon(canon);

describe("registration gate — classify()", () => {
  it("classifies a forced 6x6 board as 'unique'", () => {
    expect(classify(model(UNIQUE))).toBe("unique");
  });

  it("classifies two free 4x2 halves as 'multiple'", () => {
    expect(classify(model(MULTIPLE))).toBe("multiple");
  });

  it("classifies a lone 2x2 region (only an O fits) as 'none'", () => {
    expect(classify(model(NONE))).toBe("none");
  });
});

describe("uniqueness proof — countSolutions()", () => {
  it("returns exactly 1 for the unique puzzle", () => {
    expect(countSolutions(model(UNIQUE), 2)).toBe(1);
  });

  it("returns >= 2 for the ambiguous puzzle", () => {
    expect(countSolutions(model(MULTIPLE), 2)).toBe(2);
  });

  it("returns 0 for the unsatisfiable puzzle", () => {
    expect(countSolutions(model(NONE), 2)).toBe(0);
  });
});

describe("solution extraction — solve()", () => {
  it("yields the forced unique shading, independently rule-valid", () => {
    const grid = solve(model(UNIQUE));
    expect(grid).not.toBeNull();
    expect(isValidSolution(UNIQUE, grid!)).toBe(true);
    // The one shaded pattern for this board (see fixtures UNIQUE).
    expect(grid).toEqual([
      [0, 1, 0, 1, 0, 0],
      [0, 1, 0, 1, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 0, 0, 1, 0, 1],
      [1, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 1],
    ]);
  });

  it("produces a rule-valid grid for an ambiguous board (any one solution)", () => {
    const grid = solve(model(MULTIPLE));
    expect(grid).not.toBeNull();
    expect(isValidSolution(MULTIPLE, grid!)).toBe(true);
  });

  it("returns null when there is no solution", () => {
    expect(solve(model(NONE))).toBeNull();
  });
});

describe("rule enforcement", () => {
  // A single 4x1 region: the only tetromino that fits is an I. With one region there is
  // no connectivity/adjacency interaction, so it must be uniquely solvable.
  it("a lone 1x4 region forces the single I", () => {
    const canon = canonFromRegions(["AAAA"]);
    expect(classify(LitsModel.fromCanon(canon))).toBe("unique");
    expect(solve(LitsModel.fromCanon(canon))).toEqual([[1, 1, 1, 1]]);
  });

  // Two 1x4 I-regions stacked with no gap would be two adjacent I pieces (rule 4) AND
  // would form shaded 2x2s (rule 3): unsatisfiable.
  it("two stacked 1x4 regions are unsatisfiable (adjacent I + 2x2)", () => {
    const canon = canonFromRegions(["AAAA", "BBBB"]);
    expect(classify(LitsModel.fromCanon(canon))).toBe("none");
  });
});

describe("serialized solution shape", () => {
  it("mirrors the LITS answer { shaded }", async () => {
    const { litsPlugin } = await import("./index");
    const grid = solve(model(UNIQUE))!;
    expect(litsPlugin.serializeSolution!(grid)).toEqual({ shaded: grid });
  });
});

describe("gate() end-to-end", () => {
  it("returns the serialized shaded grid for a unique LITS puzzle", async () => {
    const { gate } = await import("../../gate");
    const result = gate(15, UNIQUE);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("unique");
    expect(result!.solution).toEqual({ shaded: solve(model(UNIQUE)) });
  });

  it("reports 'multiple' with no solution payload", async () => {
    const { gate } = await import("../../gate");
    const result = gate(15, MULTIPLE);
    expect(result).toEqual({ verdict: "multiple", solution: null });
  });
});

// -- real boards ----------------------------------------------------------------

import nikoli193 from "./nikoli-193.json";

/** Fixture walls are stored as "0101..." strings per row to keep the file small. */
function canonFromStrings(f: { h: string[]; v: string[] }): LitsCanon {
  const toRow = (s: string) => [...s].map(Number);
  return { grids: { h: f.h.map(toRow), v: f.v.map(toRow) } };
}

describe("Nikoli Vol. 193 boards", () => {
  // These three timed out ("unknown") under the old model, which only checked
  // connectivity at the leaves. Cell-level propagation settles most regions up front.
  for (const [id, fixture] of Object.entries(nikoli193 as Record<string, { size: string; h: string[]; v: string[] }>)) {
    it(`proves ${fixture.size} board ${id.slice(0, 8)} unique within the gate budget`, async () => {
      const { gate } = await import("../../gate");
      const canon = canonFromStrings(fixture);
      const result = gate(15, canon);
      expect(result!.verdict).toBe("unique");
      expect(isValidSolution(canon, (result!.solution as { shaded: number[][] }).shaded)).toBe(true);
    });
  }
});

// -- soundness against brute force ------------------------------------------------

/** Deterministic random partition of a rows x cols grid into connected regions. */
function randomRegions(rows: number, cols: number, seed: number): string[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const owner = new Array<number>(rows * cols).fill(-1);
  let next = 0;
  for (let start = 0; start < rows * cols; start++) {
    if (owner[start] >= 0) continue;
    const id = next++;
    const target = 4 + Math.floor(rnd() * 3);
    const members = [start];
    owner[start] = id;
    while (members.length < target) {
      const frontier: number[] = [];
      for (const x of members) {
        const r = Math.floor(x / cols);
        const c = x % cols;
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && owner[nr * cols + nc] < 0) frontier.push(nr * cols + nc);
        }
      }
      if (!frontier.length) break;
      const pick = frontier[Math.floor(rnd() * frontier.length)];
      owner[pick] = id;
      members.push(pick);
    }
  }
  // Greedy growth leaves scraps of 1-3 cells that can never hold a piece, which would make
  // every board trivially unsolvable. Fold each scrap into a neighbouring region.
  for (let merged = true; merged; ) {
    merged = false;
    const size = new Map<number, number>();
    for (const id of owner) size.set(id, (size.get(id) ?? 0) + 1);
    for (let x = 0; x < rows * cols && !merged; x++) {
      if (size.get(owner[x])! >= 4) continue;
      const r = Math.floor(x / cols);
      const c = x % cols;
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const other = owner[nr * cols + nc];
        if (other === owner[x]) continue;
        const scrap = owner[x];
        for (let y = 0; y < owner.length; y++) if (owner[y] === scrap) owner[y] = other;
        merged = true;
        break;
      }
    }
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => letters[owner[r * cols + c] % letters.length]).join(""),
  );
}

/** Count solutions by trying every combination of one placement per region. */
function bruteForceCount(canon: LitsCanon, limit: number): number | null {
  const rows = canon.grids.h.length + 1;
  const cols = canon.grids.v[0].length + 1;
  // Independent of the model: own region flood fill, own piece enumeration (every
  // 4-cell subset of a region that the rule checker accepts as a lone piece).
  const regionOf = (() => {
    const region = new Array<number>(rows * cols).fill(-1);
    let next = 0;
    for (let s = 0; s < rows * cols; s++) {
      if (region[s] >= 0) continue;
      const id = next++;
      const stack = [s];
      region[s] = id;
      while (stack.length) {
        const x = stack.pop()!;
        const r = Math.floor(x / cols);
        const c = x % cols;
        const go = (y: number, open: boolean) => {
          if (open && region[y] < 0) {
            region[y] = id;
            stack.push(y);
          }
        };
        if (r > 0) go(x - cols, !canon.grids.h[r - 1][c]);
        if (r < rows - 1) go(x + cols, !canon.grids.h[r][c]);
        if (c > 0) go(x - 1, !canon.grids.v[r][c - 1]);
        if (c < cols - 1) go(x + 1, !canon.grids.v[r][c]);
      }
    }
    return region;
  })();
  const regionCount = Math.max(...regionOf) + 1;
  const options: number[][][] = [];
  for (let rid = 0; rid < regionCount; rid++) {
    const cells = regionOf.flatMap((g, i) => (g === rid ? [i] : []));
    const opts: number[][] = [];
    const choose = (from: number, picked: number[]) => {
      if (picked.length === 4) {
        const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
        for (const x of picked) grid[Math.floor(x / cols)][x % cols] = 1;
        // A lone region's own validity check: connected, non-O tetromino.
        const sub = canonFromRegions(Array.from({ length: rows }, (_, r) => "A".repeat(cols)));
        if (isValidSolution(sub, grid)) opts.push([...picked]);
        return;
      }
      for (let i = from; i < cells.length; i++) choose(i + 1, [...picked, cells[i]]);
    };
    choose(0, []);
    options.push(opts);
  }
  if (options.reduce((p, o) => p * Math.max(o.length, 1), 1) > limit) return null;
  let count = 0;
  const walk = (rid: number, shaded: number[]) => {
    if (rid === regionCount) {
      const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
      for (const x of shaded) grid[Math.floor(x / cols)][x % cols] = 1;
      if (isValidSolution(canon, grid)) count++;
      return;
    }
    for (const o of options[rid]) walk(rid + 1, [...shaded, ...o]);
  };
  walk(0, []);
  return count;
}

describe("soundness: exact solution counts match brute force", () => {
  it("agrees on random small boards", () => {
    let checked = 0;
    let solvable = 0;
    for (let seed = 1; seed <= 600 && checked < 80; seed++) {
      const rows = 4 + (seed % 3);
      const cols = 5 + (seed % 2);
      const canon = canonFromRegions(randomRegions(rows, cols, seed));
      const expected = bruteForceCount(canon, 20_000);
      if (expected === null) continue;
      checked++;
      if (expected > 0) solvable++;
      expect(countSolutions(LitsModel.fromCanon(canon), 1e9), `seed ${seed}`).toBe(expected);
    }
    expect(checked).toBeGreaterThanOrEqual(40);
    // Boards with no solution only exercise the "none" path; make sure the comparison
    // also covers boards with one or many solutions.
    expect(solvable).toBeGreaterThanOrEqual(10);
  }, 30_000); // the brute-force reference is slow; the model itself takes milliseconds
});
