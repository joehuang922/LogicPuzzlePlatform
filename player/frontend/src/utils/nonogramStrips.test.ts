import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { StripLineReading } from "../api/client";
import {
  RepairLine,
  StripInput,
  autoRepair,
  candidates,
  checkClues,
  combineLines,
  findSuspects,
  parseClueText,
  close,
  placeStrips,
  propagate,
} from "./nonogramStrips";

const line = (clues: number[] | null): StripLineReading | null =>
  clues === null ? null : { index: 0, clues, complete: true, flags: [], boxes: [], alternates: [] };

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

  it("an overlap whose edge rows are misread a digit apart still places", () => {
    // Long, distinct lines (as on a real board) so a wrong offset can't pass for close.
    const rows = Array.from({ length: 20 }, (_, i) => [i + 1, 2, (i % 4) + 3, 1, 9]);
    const blurred = rows.slice(0, 8).map((c, i) => (i >= 6 ? [c[0], c[1], c[2] + 5, c[3], c[4]] : c));
    const strips = [strip("top", blurred, { startBorder: true }), strip("next", rows.slice(3, 12), { firstThick: 2 })];
    const p = placeStrips(strips, 20);
    // 3 lines alike, 2 a misread apart: placed (they used to count as 2 contradictions).
    expect(p.get("next")).toMatchObject({ offset: 3, how: "overlap" });
  });

  it("a manual offset wins, and a strip with nothing to go on stays unplaced", () => {
    const p = placeStrips([strip("a", truth.slice(3, 6), { manualOffset: 3 }), strip("b", truth.slice(10, 12))], 20);
    expect(p.get("a")).toMatchObject({ offset: 3, how: "manual" });
    expect(p.get("b")).toMatchObject({ offset: null, how: "unplaced" });
  });
});

describe("close", () => {
  it("is a misread or two apart in a line with as many clues", () => {
    expect(close([1, 19, 3, 1, 7, 1, 20], [1, 19, 3, 1, 7, 1, 24])).toBe(true);
    expect(close([25, 1, 29, 2, 5], [25, 1, 99, 2, 5])).toBe(true);
    expect(close([2, 5], [2, 5])).toBe(false); // alike, not close
    expect(close([1, 2, 3], [1, 2])).toBe(false);
    expect(close([1, 2, 3, 4, 5, 6], [9, 9, 9, 4, 5, 6])).toBe(false);
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

describe("candidates", () => {
  const ln = (over: Partial<RepairLine> = {}): RepairLine => ({ clues: null, readings: [], alternates: [], doubtful: false, locked: false, ...over });

  it("with the totals' change: one number off by it, or one missed", () => {
    const c = candidates(ln(), [3, 16, 5], 2, 110).map((x) => x.join(" "));
    expect(c).toEqual(expect.arrayContaining(["5 16 5", "3 18 5", "3 16 7", "2 3 16 5", "3 16 5 2"]));
    expect(c.every((x) => x.split(" ").map(Number).reduce((a, b) => a + b, 0) === 26)).toBe(true);
  });

  it("without it: digit mix-ups, splits, merges, and the other crop's reading", () => {
    const c = candidates(ln({ alternates: [[0, 4]] }), [12, 6], null, 200).map((x) => x.join(" "));
    expect(c).toEqual(expect.arrayContaining(["4 6", "12 8", "1 2 6", "126", "6 12", "17 6"]));
  });

  it("a mix-up of the other crop's reading too: a blurred 21 read as 1 and as 27", () => {
    const c = candidates(ln({ alternates: [[1, 27]] }), [3, 1, 14], null, 200).map((x) => x.join(" "));
    expect(c).toContain("3 21 14");
  });

  it("drops lists that don't fit the line", () => {
    expect(candidates(ln(), [3, 3], 4, 8).map((x) => x.join(" "))).not.toContain("3 7");
  });
});

describe("autoRepair on the 175x110 sample", () => {
  const canon = JSON.parse(
    readFileSync(resolve(__dirname, "../../../../docs/nonogram/strips/q83.canon.json"), "utf8"),
  ) as { rowClues: number[][]; colClues: number[][] };
  const asLines = (cl: number[][], doubtful: number[] = []): RepairLine[] =>
    cl.map((c, i) => ({ clues: c, readings: [c], alternates: [], doubtful: doubtful.includes(i), locked: false }));

  it("finds and fixes the real misread (column 146: 18 read as 16)", async () => {
    const cols = canon.colClues.map((c) => [...c]);
    cols[145][cols[145].indexOf(18)] = 16;
    const res = await autoRepair(asLines(canon.rowClues), asLines(cols));
    expect(res.kind).toBe("solved");
    expect(res.fixes).toEqual([expect.objectContaining({ id: "c145", from: cols[145], to: canon.colClues[145] })]);
  }, 120_000);

  it("settles lines two strips read differently", async () => {
    const rows = asLines(canon.rowClues);
    const truth = canon.rowClues[60];
    const wrong = [...truth];
    wrong[0] += 1;
    rows[60] = { clues: null, readings: [wrong, truth], alternates: [], doubtful: true, locked: false };
    const res = await autoRepair(rows, asLines(canon.colClues));
    expect(res.kind).toBe("solved");
    expect(res.fixes).toEqual([expect.objectContaining({ id: "r60", to: truth })]);
  }, 120_000);

  it("fixes two misreads at once among the doubtful lines", async () => {
    const rows = canon.rowClues.map((c) => [...c]);
    const cols = canon.colClues.map((c) => [...c]);
    // a 6 read as 8 in a row, a 3 read as 8 in a column: totals off by 3
    const r = rows.findIndex((c) => c.includes(6));
    const c = cols.findIndex((x) => x.includes(3) && !x.includes(8));
    rows[r][rows[r].indexOf(6)] = 8;
    cols[c][cols[c].indexOf(3)] = 8;
    const res = await autoRepair(asLines(rows, [r, 3, 9]), asLines(cols, [c, 20, 40]));
    expect(res.kind).toBe("solved");
    expect(res.fixes.map((f) => [f.id, f.to])).toEqual([
      [`r${r}`, canon.rowClues[r]],
      [`c${c}`, canon.colClues[c]],
    ]);
  }, 300_000);

  it("a blurred scan: several misreads, some unnoticed, read off the picture", async () => {
    const rows = canon.rowClues.map((c) => [...c]);
    const cols = canon.colClues.map((c) => [...c]);
    const longest = (cl: number[][]) => cl.findIndex((c) => c.length >= 6);
    const r1 = longest(rows), r2 = rows.findIndex((c, i) => i > r1 + 20 && c.length >= 6);
    rows[r1] = rows[r1].filter((_, k) => k !== 2); // a number missed
    rows[r2] = [...rows[r2].slice(0, -1), rows[r2].at(-1)! + 10]; // a 1 gained
    cols[145][cols[145].indexOf(18)] = 16; // unnoticed: no flag
    const res = await autoRepair(asLines(rows, [r1, r2]), asLines(cols));
    expect(res.kind).toBe("solved");
    const fixed = Object.fromEntries(res.fixes.map((f) => [f.id, f.to]));
    expect(fixed).toEqual({ [`r${r1}`]: canon.rowClues[r1], [`r${r2}`]: canon.rowClues[r2], c145: canon.colClues[145] });
  }, 300_000);

  it("never changes a line a person set, and hands back what it can't settle", async () => {
    const cols = canon.colClues.map((c) => [...c]);
    cols[145][cols[145].indexOf(18)] = 16;
    const lines = asLines(cols);
    lines[145].locked = true;
    const res = await autoRepair(asLines(canon.rowClues), lines, undefined, 2_000);
    expect(res.kind).toBe("stuck");
    expect(res.fixes).toEqual([]);
  }, 300_000);
});
