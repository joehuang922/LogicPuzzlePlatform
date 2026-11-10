import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { gate } from "../../gate";
import { nextPlacement } from "../../hint";
import { SudokuCanon } from "./model";
import { sudokuDims, sudokuGeometry } from "./index";

// The three real magazine boards in docs/sudoku (16x16 4x4 rooms, 25x25 5x5, 30x30 with
// rooms 6 wide and 5 tall), as their *.canon.json files.
const board = (size: string): SudokuCanon =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../../../docs/sudoku/board-sudoku-${size}.canon.json`, import.meta.url)), "utf8")
  );

describe("sudoku sizes", () => {
  it("defaults to 3x3 rooms", () => {
    expect(sudokuDims({})).toEqual({ roomWidth: 3, roomHeight: 3, size: 9 });
    expect(sudokuDims({ room_width: 6, room_height: 5 })).toEqual({ roomWidth: 6, roomHeight: 5, size: 30 });
  });

  it("builds rows, columns and rectangular boxes", () => {
    const geo = sudokuGeometry({ roomWidth: 6, roomHeight: 5, size: 30 });
    expect(geo.size).toBe(900);
    expect(geo.digits).toBe(30);
    expect(geo.units).toHaveLength(90);
    // Box 2 (the second in reading order) starts at R1C7 and is 6 wide, 5 tall.
    const box2 = geo.units[61];
    expect(box2[0]).toBe(6);
    expect(box2[5]).toBe(11);
    expect(box2[6]).toBe(36);
    expect(box2.at(-1)).toBe(4 * 30 + 11);
    // Peers: 29 in the row, 29 in the column, the box's 29 minus the 5 + 4 counted already.
    expect(geo.peers[0]).toHaveLength(29 + 29 + 29 - 5 - 4);
  });

  for (const size of ["16x16", "25x25", "30x30"]) {
    it(`${size}: unique, and the hint ladder solves it from empty to full`, () => {
      const canon = board(size);
      const n = sudokuDims(canon).size;
      const verdict = gate(1, canon);
      expect(verdict?.verdict).toBe("unique");
      const solution = (verdict!.solution as { hints: number[][] }).hints;

      const values: Record<string, number> = {};
      const empties = canon.hints.flat().filter((v) => v === 0).length;
      for (let i = 0; i < empties; i++) {
        const step = nextPlacement(1, canon, values);
        expect(step?.placement).toBeDefined();
        const { cell, value } = step!.placement!;
        const [r, c] = [Math.floor(cell / n), cell % n];
        expect(value).toBe(solution[r][c]);
        values[`${c},${r}`] = value;
      }
    }, 60_000);
  }
});
