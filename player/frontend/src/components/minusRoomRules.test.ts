import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MinusRoomCanon } from "../types/canon";
import {
  gridOf,
  liveErrors,
  minusRoomFormatProblems,
  minusRoomProgress,
  validateMinusRoom,
} from "./minusRoomRules";

const dir = join(__dirname, "../../../../docs/minus-room");
const load = (name: string) => ({
  canon: JSON.parse(readFileSync(join(dir, `${name}.canon.json`), "utf8")) as MinusRoomCanon,
  numbers: JSON.parse(readFileSync(join(dir, `${name}.solution.json`), "utf8")).numbers as number[][],
});
const SAMPLES = ["board-minus-room-1", "board-minus-room-2", "board-minus-room-3"];

/** Player values for a full grid (givens left out, as the board stores them). */
function valuesOf(canon: MinusRoomCanon, numbers: number[][]): Record<string, number> {
  const values: Record<string, number> = {};
  numbers.forEach((row, r) => row.forEach((v, c) => canon.cells[r][c] === 0 && v > 0 && (values[`${c},${r}`] = v)));
  return values;
}

const { canon: b1, numbers: s1 } = load("board-minus-room-1");
const solved1 = valuesOf(b1, s1);
const withCell = (values: Record<string, number>, r: number, c: number, v: number | null) => {
  const next = { ...values };
  if (v === null) delete next[`${c},${r}`];
  else next[`${c},${r}`] = v;
  return next;
};

describe("samples", () => {
  for (const name of SAMPLES) {
    it(`${name}: the solution solves it`, () => {
      const { canon, numbers } = load(name);
      const values = valuesOf(canon, numbers);
      expect(minusRoomFormatProblems(canon)).toEqual([]);
      expect(gridOf(canon, values)).toEqual(numbers);
      expect(validateMinusRoom(canon, values)).toBe(true);
      expect(minusRoomProgress(canon, values)).toBe(100);
      const errs = liveErrors(canon, values);
      expect(errs.cells.size + errs.circles.size).toBe(0);
    });
  }
});

// Board 1's solution:
//   1 2 1 3 3
//   4 2 2 2 3
//   4 1 2 3 1
//   4 4 2 3 3
//   1 4 4 4 4
describe("validateMinusRoom", () => {
  it("needs every cell", () => {
    expect(validateMinusRoom(b1, withCell(solved1, 0, 0, null))).toBe(false);
  });
  it("rejects a wrong block size", () => {
    // (0,0) 1 -> 2: a 2-block of one cell
    expect(validateMinusRoom(b1, withCell(solved1, 0, 0, 2))).toBe(false);
  });
  it("rejects a broken circle", () => {
    const canon = { ...b1, circles: [{ dr: 1, dc: 0, value: 2 }] };
    expect(validateMinusRoom(canon, solved1)).toBe(false);
  });
  it("rejects two blocks of one number in a room (rule 4)", () => {
    const canon: MinusRoomCanon = {
      rows: 2,
      cols: 3,
      max: 2,
      cells: [[0, 0, 0], [0, 0, 0]],
      edges: { h: [[0, 0, 0]], v: [[0, 0], [0, 0]] },
      circles: [],
    };
    // 1 2 1 / 2 2 ... (one room): blocks 1, 1 -> two 1-blocks
    const v = { "0,0": 1, "1,0": 2, "2,0": 1, "0,1": 2, "1,1": 1, "2,1": 2 };
    expect(validateMinusRoom(canon, v)).toBe(false);
  });
  it("rejects a 2x2 of equal numbers across rooms (rule 5)", () => {
    // Four 1-rooms in a 2x2 holding 1s: every block is fine alone.
    const canon: MinusRoomCanon = {
      rows: 2,
      cols: 2,
      max: 1,
      cells: [[0, 0], [0, 0]],
      edges: { h: [[1, 1]], v: [[1], [1]] },
      circles: [],
    };
    expect(validateMinusRoom(canon, { "0,0": 1, "1,0": 1, "0,1": 1, "1,1": 1 })).toBe(false);
  });
});

describe("liveErrors", () => {
  it("flags a block bigger than its number", () => {
    // (2,1) 1 -> 2 joins the 2-block above? (1,1),(2,1) are in room B with (0,1)=2: 3 twos.
    const errs = liveErrors(b1, withCell(solved1, 2, 1, 2));
    expect(errs.cells.has("2,1")).toBe(true);
  });
  it("flags a closed block smaller than its number, not an open one", () => {
    // (0,0) alone as 3: closed (its room's neighbour (1,0) holds 4).
    expect(liveErrors(b1, withCell(solved1, 0, 0, 3)).cells.has("0,0")).toBe(true);
    // with (1,0) empty it could still grow
    const open = withCell(withCell(solved1, 0, 0, 3), 1, 0, null);
    expect(liveErrors(b1, open).cells.has("0,0")).toBe(false);
  });
  it("flags a wrong circle only once both cells are filled", () => {
    const canon = { ...b1, circles: [{ dr: 1, dc: 0, value: 2 }] };
    expect(liveErrors(canon, solved1).circles).toEqual(new Set([0]));
    expect(liveErrors(canon, withCell(solved1, 0, 0, null)).circles.size).toBe(0);
  });
  it("flags nothing on the empty board", () => {
    const errs = liveErrors(b1, {});
    expect(errs.cells.size + errs.circles.size).toBe(0);
    expect(minusRoomProgress(b1, {})).toBe(0);
  });
  it("ignores values above max", () => {
    expect(gridOf(b1, { "0,0": 7 })[0][0]).toBe(0);
  });
});

describe("minusRoomFormatProblems", () => {
  it("lists problems", () => {
    const bad: MinusRoomCanon = {
      ...b1,
      cells: b1.cells.map((row, r) => (r === 0 ? [5, ...row.slice(1)] : row)),
      circles: [
        { dr: 0, dc: 0, value: 1 },
        { dr: 1, dc: 0, value: 4 },
        { dr: 1, dc: 0, value: 1 },
      ],
    };
    const problems = minusRoomFormatProblems(bad);
    expect(problems.some((p) => p.includes("above 4"))).toBe(true);
    expect(problems.some((p) => p.includes("not on an edge"))).toBe(true);
    expect(problems.some((p) => p.includes("4 or more"))).toBe(true);
    expect(problems.some((p) => p.includes("Two circles"))).toBe(true);
  });
  it("flags a wall that ends inside a room", () => {
    // One 2x2 room with a wall stub between (0,0) and (0,1): still one room.
    const canon: MinusRoomCanon = {
      rows: 2, cols: 2, max: 2, cells: [[0, 0], [0, 0]], edges: { h: [[0, 0]], v: [[1], [0]] }, circles: [],
    };
    expect(minusRoomFormatProblems(canon)).toEqual(["1 wall ends inside a room"]);
  });
});
