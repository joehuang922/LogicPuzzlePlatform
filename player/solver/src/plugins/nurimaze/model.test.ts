import { describe, it, expect } from "vitest";
import { classify, solve } from "../../drivers";
import { gate } from "../../gate";
import { NurimazeModel, NurimazeCanon } from "./model";
import fixtures from "./fixtures.json";

// Production boards (two 10x10, the 17x17), the 45x31 photo as parsed after the
// flatten + wall-cut fixes ("giant"), and the same puzzle as first stored, with misread
// walls ("giant_misread").
const F = fixtures as Record<string, NurimazeCanon>;

/** Independent rule check of a `states` grid (1 black, 2 white). */
function isValid(canon: NurimazeCanon, st: number[][]): string {
  const R = st.length;
  const C = st[0].length;
  const w = (r: number, c: number) => st[r][c] === 2;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (st[r][c] !== 1 && st[r][c] !== 2) return "undecided cell";
      if (canon.cells[r][c] && !w(r, c)) return "symbol painted black";
      if (r + 1 < R && !canon.grids.h[r][c] && st[r][c] !== st[r + 1][c]) return "room split";
      if (c + 1 < C && !canon.grids.v[r][c] && st[r][c] !== st[r][c + 1]) return "room split";
      if (r + 1 < R && c + 1 < C) {
        const sum = st[r][c] + st[r + 1][c] + st[r][c + 1] + st[r + 1][c + 1];
        if (sum === 4 || sum === 8) return "2x2 of one colour";
      }
    }
  }
  let cells = 0;
  let edges = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!w(r, c)) continue;
      cells++;
      if (r + 1 < R && w(r + 1, c)) edges++;
      if (c + 1 < C && w(r, c + 1)) edges++;
    }
  }
  const find = (v: number) => {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (canon.cells[r][c] === v) return [r, c];
    return [-1, -1];
  };
  const [S, G] = [find(3), find(4)];
  const parent = new Map<string, string | null>([[S.join(), null]]);
  const queue = [S];
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [a, b] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      if (a >= 0 && b >= 0 && a < R && b < C && w(a, b) && !parent.has([a, b].join())) {
        parent.set([a, b].join(), [r, c].join());
        queue.push([a, b]);
      }
    }
  }
  if (parent.size !== cells) return "white cells not connected";
  if (edges !== cells - 1) return "white cells form a loop";
  const route = new Set<string>();
  for (let k: string | null = G.join(); k; k = parent.get(k)!) route.add(k);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (canon.cells[r][c] === 1 && !route.has([r, c].join())) return "circle off the route";
      if (canon.cells[r][c] === 2 && route.has([r, c].join())) return "triangle on the route";
    }
  }
  return "valid";
}

describe("nurimaze solver", () => {
  for (const name of ["small_a", "small_b", "giant"]) {
    it(`${name} is unique by deduction alone, and valid`, () => {
      const model = NurimazeModel.fromCanon(F[name]);
      expect(model.isDead()).toBe(false);
      expect(model.undecided()).toBe(0);
      expect(classify(NurimazeModel.fromCanon(F[name]))).toBe("unique");
      expect(isValid(F[name], solve(NurimazeModel.fromCanon(F[name]))!)).toBe("valid");
    });
  }

  it("medium (17x17) is unique and valid within the gate budget", () => {
    expect(classify(NurimazeModel.fromCanon(F.medium), { deadline: Date.now() + 10_000 })).toBe("unique");
    expect(isValid(F.medium, solve(NurimazeModel.fromCanon(F.medium))!)).toBe("valid");
  }, 30_000);

  it("a misread board is proven impossible, with where it breaks", () => {
    const model = NurimazeModel.fromCanon(F.giant_misread);
    expect(model.isDead()).toBe(true);
    expect(model.contradiction?.cells.length).toBeGreaterThan(0);
    expect(classify(NurimazeModel.fromCanon(F.giant_misread))).toBe("none");
  });

  it("never rejects or mis-forces a partial board that agrees with the solution", () => {
    // Soundness: assign random subsets of the true room colours; propagation must
    // neither die nor decide a room against the solution.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (const name of ["small_a", "medium"]) {
      const sol = solve(NurimazeModel.fromCanon(F[name]))!;
      const base = NurimazeModel.fromCanon(F[name]);
      const { roomCells, cols } = base.layout;
      const truth = roomCells.map((cells) => (sol[Math.floor(cells[0] / cols)][cells[0] % cols] === 1 ? 0 : 1));
      for (let t = 0; t < 15; t++) {
        let m = base;
        const frac = rnd() * 0.6;
        for (let r = 0; r < truth.length; r++) if (rnd() < frac && m.roomState(r) === -1) m = m.assign(r, truth[r]);
        expect(m.isDead()).toBe(false);
        for (let r = 0; r < truth.length; r++) if (m.roomState(r) !== -1) expect(m.roomState(r)).toBe(truth[r]);
      }
    }
  }, 60_000);

  it("the gate stores the states grid", () => {
    const result = gate(3, F.small_a)!;
    expect(result.verdict).toBe("unique");
    const { states } = result.solution as { states: number[][] };
    expect(isValid(F.small_a, states)).toBe("valid");
  });
});
