import { describe, expect, it } from "vitest";
import { sortPuzzleTypes, PuzzleType } from "./client";

const t = (id: number, incubating?: boolean): PuzzleType => ({ id, name: `t${id}`, jpLabel: "", rule: "", incubating });

describe("sortPuzzleTypes", () => {
  it("lists incubating types last, each group by id", () => {
    const sorted = sortPuzzleTypes([t(37, true), t(2), t(36), t(5, true), t(1)]);
    expect(sorted.map((x) => x.id)).toEqual([1, 2, 36, 5, 37]);
  });
  it("treats a missing flag as not incubating", () => {
    expect(sortPuzzleTypes([t(3, false), t(1, undefined)]).map((x) => x.id)).toEqual([1, 3]);
  });
});
