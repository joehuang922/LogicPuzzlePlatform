import { describe, expect, it } from "vitest";
import { nonogramExtractor } from "./nonogram";
import { PuzzleDefinition } from "../types/puzzle";

const puzzle = {
  id: "p",
  puzzleType: 6,
  canonRepr: { rowClues: [[1], [1]], colClues: [[1], [1]] },
} as unknown as PuzzleDefinition;

describe("nonogram extractor", () => {
  it("saves crosses as well as fills, so a reload keeps the marks", () => {
    expect(nonogramExtractor.extract(puzzle, { "0,0": 1, "1,0": 2, "1,1": 1 })).toEqual({
      cells: [
        [1, 2],
        [0, 1],
      ],
    });
  });
});
