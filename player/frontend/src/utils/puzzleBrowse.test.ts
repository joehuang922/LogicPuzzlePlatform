import { describe, expect, it } from "vitest";
import { groupByCollection, groupByType, sizeTag } from "./puzzleBrowse";

const p = (puzzleType: number, width: number | null, height: number | null, canonRepr: Record<string, unknown> = {}) =>
  ({ puzzleType, width, height, canonRepr });

describe("sizeTag", () => {
  it("sudoku by side", () => {
    expect(sizeTag(p(1, 9, 9))).toBeNull();
    expect(sizeTag(p(1, 12, 12))).toBeNull();
    expect(sizeTag(p(1, 16, 16))).toBe("BIG");
    expect(sizeTag(p(1, 25, 25))).toBe("GIANT");
    expect(sizeTag(p(1, null, null, { hints: new Array(16).fill([]) }))).toBe("BIG");
  });
  it("combo sudoku by subboards", () => {
    const combo = (n: number) => p(2, 21, 21, { subboards: new Array(n).fill({}) });
    expect(sizeTag(combo(9))).toBeNull();
    expect(sizeTag(combo(10))).toBe("BIG");
    expect(sizeTag(combo(20))).toBe("GIANT");
  });
  it("picturesque maze by cells", () => {
    expect(sizeTag(p(44, 50, 50))).toBeNull();
    expect(sizeTag(p(44, 80, 119))).toBeNull();
    expect(sizeTag(p(44, 80, 120))).toBe("BIG");
    expect(sizeTag(p(44, 240, 119))).toBe("BIG");
    expect(sizeTag(p(44, 240, 120))).toBe("GIANT");
  });

  it("nonogram by cells", () => {
    expect(sizeTag(p(6, 50, 59))).toBeNull();
    expect(sizeTag(p(6, 50, 60))).toBe("BIG");
    expect(sizeTag(p(6, 100, 100))).toBe("GIANT");
  });
  it("other types by cells", () => {
    expect(sizeTag(p(5, 30, 33))).toBeNull();
    expect(sizeTag(p(5, 40, 25))).toBe("BIG");
    expect(sizeTag(p(5, 50, 40))).toBe("GIANT");
    expect(sizeTag(p(5, null, null))).toBeNull();
  });
});

describe("groupByCollection", () => {
  it("orders collections by name, Uncategorized last, titles within", () => {
    const q = (title: string, srcCollectionName: string | null) => ({ title, srcCollectionName });
    const groups = groupByCollection([q("b", "Vol 2"), q("z", null), q("B2", "alpha"), q("a", "Vol 2"), q("a1", "alpha")]);
    expect(groups.map((g) => g.collectionName)).toEqual(["alpha", "Vol 2", "Uncategorized"]);
    expect(groups[0].puzzles.map((x) => x.title)).toEqual(["a1", "B2"]);
    expect(groups[1].puzzles.map((x) => x.title)).toEqual(["a", "b"]);
  });
});

describe("groupByType", () => {
  it("orders types by id and titles case-insensitively within each", () => {
    const p = (puzzleType: number, title: string | null) => ({ puzzleType, title });
    const groups = groupByType([p(5, "b"), p(2, "Zeta"), p(5, "A"), p(2, "alpha"), p(5, null)]);
    expect(groups.map((g) => g.typeId)).toEqual([2, 5]);
    expect(groups[0].puzzles.map((x) => x.title)).toEqual(["alpha", "Zeta"]);
    expect(groups[1].puzzles.map((x) => x.title)).toEqual([null, "A", "b"]);
  });
});
