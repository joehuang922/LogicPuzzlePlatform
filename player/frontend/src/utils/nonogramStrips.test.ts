import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { StripLineReading } from "../api/client";
import {
  StripInput,
  checkClues,
  combineLines,
  findSuspects,
  parseClueText,
  placeStrips,
  propagate,
} from "./nonogramStrips";

const line = (clues: number[] | null): StripLineReading | null =>
  clues === null ? null : { index: 0, clues, complete: true, flags: [], boxes: [] };

function strip(id: string, clues: (number[] | null)[], opts: Partial<StripInput> & { firstThick?: number } = {}): StripInput {
  const first = opts.firstThick ?? 0;
  return {
    id,
    lines: clues.map(line),
    thick: Array.from({ length: clues.length + 1 }, (_, j) => (j - first) % 5 === 0),
    startBorder: opts.startBorder ?? false,
    endBorder: opts.endBorder ?? false,
    manualOffset: opts.manualOffset ?? null,
  };
}

const truth = Array.from({ length: 20 }, (_, i) => [(i % 7) + 1, (i % 3) + 1]);

describe("placeStrips", () => {
  it("places by border, then by overlap and the every-5 phase", () => {
    const strips = [
      strip("top", truth.slice(0, 9), { startBorder: true }),
      strip("bottom", truth.slice(12), { endBorder: true, firstThick: 3 }),
      strip("middle", truth.slice(6, 15), { firstThick: 4 }),
    ];
    const p = placeStrips(strips, 20);
    expect([...p.values()].map((x) => [x.offset, x.how])).toEqual([
      [0, "start border"],
      [12, "end border"],
      [6, "overlap"],
    ]);
    const lines = combineLines(strips, p, 20, new Map());
    expect(lines.map((l) => l.clues)).toEqual(truth);
    expect(lines.every((l) => l.status === "ok")).toBe(true);
  });

  it("a manual offset wins, and a strip with nothing to go on stays unplaced", () => {
    const p = placeStrips([strip("a", truth.slice(3, 6), { manualOffset: 3 }), strip("b", truth.slice(10, 12))], 20);
    expect(p.get("a")).toMatchObject({ offset: 3, how: "manual" });
    expect(p.get("b")).toMatchObject({ offset: null, how: "unplaced" });
  });
});

describe("combineLines", () => {
  it("leaves disagreeing and uncovered lines to a person; edits settle them", () => {
    const strips = [strip("a", [[1], [2], [3]], { startBorder: true }), strip("b", [[2], [9]], { manualOffset: 1 })];
    const p = placeStrips(strips, 4);
    const lines = combineLines(strips, p, 4, new Map());
    expect(lines.map((l) => l.status)).toEqual(["ok", "ok", "conflict", "missing"]);
    const edited = combineLines(strips, p, 4, new Map([[2, [3]], [3, [1, 1]]]));
    expect(edited.map((l) => [l.status, l.clues])).toEqual([["ok", [1]], ["ok", [2]], ["edited", [3]], ["edited", [1, 1]]]);
  });
});

describe("checkClues", () => {
  it("flags lines too long for the board and mismatched totals", () => {
    const rows = combineLines([strip("r", [[2], [1, 1]], { startBorder: true })], new Map([["r", { offset: 0, how: "manual", agree: 0, disagree: 0 }]]), 2, new Map());
    const cols = combineLines([strip("c", [[2], [3]], { startBorder: true })], new Map([["c", { offset: 0, how: "manual", agree: 0, disagree: 0 }]]), 2, new Map());
    const checks = Object.fromEntries(checkClues(rows, cols).map((c) => [c.name, c]));
    expect(checks["Rows fit"].ok).toBe(false);
    expect(checks["Columns fit"].ok).toBe(false);
    expect(checks["Totals"].ok).toBe(false);
  });
});

it("parseClueText", () => {
  expect(parseClueText(" 3 1, 12 ")).toEqual([3, 1, 12]);
  expect(parseClueText("3 x")).toBeNull();
  expect(parseClueText("")).toBeNull();
});

describe("propagation on the 175x110 sample", () => {
  const canon = JSON.parse(
    readFileSync(resolve(__dirname, "../../../../docs/nonogram/strips/q83.canon.json"), "utf8"),
  ) as { rowClues: number[][]; colClues: number[][] };

  it("line logic settles every cell of the verified clue set", () => {
    const p = propagate(canon.rowClues, canon.colClues);
    expect(p.contradiction).toBeNull();
    expect(p.settled).toBe(175 * 110);
  });

  it("pins the one misread line (column 146: 18 read as 16)", async () => {
    const cols = canon.colClues.map((c) => [...c]);
    cols[145][cols[145].indexOf(18)] = 16;
    expect(propagate(canon.rowClues, cols).contradiction).not.toBeNull();
    expect(await findSuspects(canon.rowClues, cols)).toEqual(["c145"]);
  }, 60_000);
});
