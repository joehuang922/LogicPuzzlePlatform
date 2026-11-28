import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { autoRepair } from "./nonogramStrips";
import { PARSED_REPAIR_OPTIONS, applyRepair, asNonogramCanon, setLine, toRepairLines } from "./parsedNonogramRepair";
import { NonogramCanon } from "../types/canon";

const medium = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../docs/nonogram/board-nonogram-medium.json"), "utf8"),
) as NonogramCanon;

/** The repair as the worker runs it, on a parsed canon. */
async function check(canon: NonogramCanon) {
  const { rows, cols } = toRepairLines(canon);
  return applyRepair(canon, await autoRepair(rows, cols, undefined, undefined, PARSED_REPAIR_OPTIONS));
}

const copy = (c: NonogramCanon): NonogramCanon => ({
  rowClues: c.rowClues.map((l) => [...l]),
  colClues: c.colClues.map((l) => [...l]),
});

describe("checking a parsed nonogram", () => {
  it("leaves a correctly read board alone", async () => {
    const { canon, check: res } = await check(medium);
    expect(res.kind).toBe("clean");
    expect(canon).toEqual(medium);
  }, 60_000);

  it("fixes one misread digit (a 3 read as 8)", async () => {
    const parsed = copy(medium);
    const c = parsed.colClues.findIndex((l) => l.includes(3));
    parsed.colClues[c][parsed.colClues[c].indexOf(3)] = 8;
    const { canon, check: res } = await check(parsed);
    expect(res.kind).toBe("fixed");
    expect(res.kind === "fixed" && res.fixes.map((f) => f.id)).toEqual([`c${c}`]);
    expect(canon).toEqual(medium);
  }, 60_000);

  it("stops with the options when more than one likely fix solves the board", async () => {
    // Row 1's 5 read as 6: setting row 1, row 2 or column 20 right each solves.
    const parsed = copy(medium);
    parsed.rowClues[0][parsed.rowClues[0].indexOf(5)] = 6;
    const { canon, check: res } = await check(parsed);
    expect(res.kind).toBe("stuck");
    expect(canon).toEqual(parsed); // nothing applied
    expect(res.kind === "stuck" && res.options).toContainEqual(expect.objectContaining({ id: "r0", to: medium.rowClues[0] }));
  }, 60_000);

  it("fixes a dropped number", async () => {
    const parsed = copy(medium);
    const c = parsed.colClues.findIndex((l) => l.length >= 3);
    parsed.colClues[c] = parsed.colClues[c].filter((_, k) => k !== 1);
    const { canon, check: res } = await check(parsed);
    expect(res.kind).toBe("fixed");
    expect(canon).toEqual(medium);
  }, 60_000);

  it("fixes two misreads, one in a row and one in a column", async () => {
    const parsed = copy(medium);
    const r = parsed.rowClues.findIndex((l) => l.includes(3));
    parsed.rowClues[r][parsed.rowClues[r].indexOf(3)] = 8;
    const c = parsed.colClues.findIndex((l) => l.includes(1));
    parsed.colClues[c][parsed.colClues[c].indexOf(1)] = 7;
    const { canon, check: res } = await check(parsed);
    expect(res.kind).toBe("fixed");
    expect(canon).toEqual(medium);
  }, 120_000);
});

describe("canon helpers", () => {
  it("writes an empty line as [0] and reads [0] as empty", () => {
    const canon: NonogramCanon = { rowClues: [[1], [0]], colClues: [[1], []] };
    expect(toRepairLines(canon).rows[1].clues).toEqual([]);
    expect(setLine(canon, "c1", []).colClues[1]).toEqual([0]);
    expect(setLine(canon, "r0", [2]).rowClues).toEqual([[2], [0]]);
  });

  it("recognises a nonogram canon", () => {
    expect(asNonogramCanon({ rowClues: [[1]], colClues: [[1]] })).not.toBeNull();
    expect(asNonogramCanon({ rows: 3 })).toBeNull();
  });
});
