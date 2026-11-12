import { describe, it, expect } from "vitest";
import { SkeletonPuzzleCanon } from "../types/canon";
import {
  boardGrid, boardLetters, candidates, filledCells, findSlots, formatProblems, isSolved,
  parseWordLines, placementsFromValues, placementsToAnswer, slotsAt, warnings, wordLines,
} from "./skeletonPuzzleRules";

// The doc's example: サクラ across row 0, ラッパ down column 2, sharing the ラ.
const canon: SkeletonPuzzleCanon = {
  cells: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  words: [{ word: "サクラ", hint: "桜" }, { word: "ラッパ" }],
};
const slots = findSlots(canon.cells);

describe("Skeleton Puzzle rules", () => {
  it("numbers slots across first, then down", () => {
    expect(slots.map((s) => [s.index, s.r, s.c, s.dir, s.length])).toEqual([
      [0, 0, 0, "across", 3],
      [1, 0, 2, "down", 3],
    ]);
    expect(slotsAt(slots, 0, 2).map((s) => s.dir)).toEqual(["across", "down"]);
  });

  it("writes small kana full-size", () => {
    expect(boardLetters("ラッパ")).toEqual(["ラ", "ツ", "パ"]);
    expect(boardLetters("じゃがいも")).toEqual(["じ", "や", "が", "い", "も"]);
  });

  it("offers only unused words that fit the crossing letters", () => {
    expect(candidates(canon, slots, new Map(), slots[0])).toEqual([0, 1]);
    // ラッパ across leaves パ at the top of the down slot: neither word starts with パ.
    expect(candidates(canon, slots, new Map([[0, 1]]), slots[1])).toEqual([]);
    expect(candidates(canon, slots, new Map([[0, 0]]), slots[1])).toEqual([1]);
  });

  it("solves the example", () => {
    const placed = placementsFromValues({ "p:0": 1, "p:1": 2 }, slots.length, canon.words.length);
    expect(boardGrid(canon, slots, placed)).toEqual([
      ["サ", "ク", "ラ"],
      ["", "", "ツ"],
      ["", "", "パ"],
    ]);
    expect(isSolved(canon, slots, placed)).toBe(true);
    expect(filledCells(canon, slots, placed)).toBe(5);
    expect(placementsToAnswer(slots, placed)).toEqual([
      { word: 0, r: 0, c: 0, dir: "across" },
      { word: 1, r: 0, c: 2, dir: "down" },
    ]);
  });

  it("rejects a clash or a missing word", () => {
    expect(isSolved(canon, slots, new Map([[0, 1], [1, 0]]))).toBe(false);
    expect(isSolved(canon, slots, new Map([[0, 0]]))).toBe(false);
    expect(filledCells(canon, slots, new Map([[0, 0]]))).toBe(3);
  });

  it("lists format problems and warnings", () => {
    expect(formatProblems(canon)).toEqual([]);
    expect(formatProblems({ ...canon, words: [canon.words[0], { word: "ab" }, { word: "ア" }] })).toEqual([
      'Word 2 "ab" must be kana (and ー) only',
      'Word 3 "ア" is under 2 letters',
      "0 slots of length 1 but 1 word of 1 letter",
      "0 slots of length 2 but 1 word of 2 letters",
      "2 slots of length 3 but 1 word of 3 letters",
    ]);
    expect(formatProblems({ ...canon, marks: [{ r: 1, c: 0, label: "A" }] })).toEqual(["Mark A at R2C1 is not on a cell"]);
    expect(warnings({ cells: [[1, 0, 1, 1]], words: [] })).toEqual(["R1C1 is a cell in no slot"]);
  });

  it("parses word lines with hints", () => {
    expect(parseWordLines("アイコ (トマト)\nコイアジ（こいあじ／トマト）\n\nモギリ")).toEqual([
      { word: "アイコ", hint: "トマト" },
      { word: "コイアジ", hint: "こいあじ／トマト" },
      { word: "モギリ" },
    ]);
    expect(wordLines(canon.words)).toBe("サクラ (桜)\nラッパ");
  });
});
