import { describe, expect, it } from "vitest";
import { conflictCells, peerMap, sudokuSize, typeDigit } from "./sudokuRules";
import { computeSudokuProgress } from "../progress/sudoku";
import { sudokuExtractor } from "../extractors/sudoku";
import { PuzzleDefinition } from "../types/puzzle";

const big = { roomWidth: 6, roomHeight: 5, size: 30 };

describe("sudoku sizes", () => {
  it("reads the room size, default 3x3", () => {
    expect(sudokuSize({})).toEqual({ roomWidth: 3, roomHeight: 3, size: 9 });
    expect(sudokuSize({ room_width: 6, room_height: 5 })).toEqual(big);
  });

  it("peers share a row, column or 6-wide, 5-tall room", () => {
    const peers = peerMap(big).get("0,0")!;
    expect(peers.size).toBe(29 + 29 + 29 - 5 - 4);
    expect(peers.has("5,4")).toBe(true); // same room
    expect(peers.has("6,4")).toBe(false); // next room over
    expect(peers.has("0,29")).toBe(true); // same column
  });

  it("flags a number repeated in a room", () => {
    const grid = Array.from({ length: 30 }, () => Array(30).fill(0));
    grid[0][0] = 27;
    grid[4][5] = 27;
    expect([...conflictCells(big, grid)].sort()).toEqual(["0,0", "5,4"]);
    grid[4][5] = 0;
    grid[4][6] = 27; // another room, row and column
    expect(conflictCells(big, grid).size).toBe(0);
  });
});

describe("typeDigit", () => {
  it("commits a digit at once when no longer number can start with it", () => {
    expect(typeDigit("", "7", 9)).toEqual({ commit: 7, pending: "" });
    expect(typeDigit("", "2", 16)).toEqual({ commit: 2, pending: "" });
    expect(typeDigit("", "4", 30)).toEqual({ commit: 4, pending: "" });
  });

  it("waits after a digit that can start a longer number", () => {
    expect(typeDigit("", "1", 16)).toEqual({ commit: null, pending: "1" });
    expect(typeDigit("1", "6", 16)).toEqual({ commit: 16, pending: "" });
    expect(typeDigit("", "3", 30)).toEqual({ commit: null, pending: "3" });
    expect(typeDigit("3", "0", 30)).toEqual({ commit: 30, pending: "" });
  });

  it("ends the number on a key that would overshoot; 0 alone is nothing", () => {
    expect(typeDigit("1", "7", 16)).toEqual({ commit: 1, pending: "" });
    expect(typeDigit("", "0", 30)).toEqual({ commit: null, pending: "" });
  });
});

describe("16x16 progress and answer", () => {
  const hints = Array.from({ length: 16 }, () => Array(16).fill(0));
  hints[0][0] = 16;
  const puzzle = { canonRepr: { room_width: 4, room_height: 4, hints } } as unknown as PuzzleDefinition;

  it("counts all 255 empty cells", () => {
    expect(computeSudokuProgress.compute(puzzle, { "15,15": 12 })).toBeCloseTo(100 / 255);
  });

  it("extracts a 16x16 answer with notes up to 16", () => {
    const answer = sudokuExtractor.extract(puzzle, { "15,15": 12, "n:3,2:16": 1, "n:3,2:17": 1 }) as {
      hints: number[][];
      notes: number[][][];
    };
    expect(answer.hints).toHaveLength(16);
    expect(answer.hints[0][0]).toBe(16);
    expect(answer.hints[15][15]).toBe(12);
    expect(answer.notes[2][3]).toEqual([16]);
  });
});
