import { PuzzleDefinition } from "../types/puzzle";
import { SlalomCanon, SlalomGate } from "../types/canon";
import { ProgressCalculator } from "./index";

function isCrossed(gate: SlalomGate, hTrail: number[][], vTrail: number[][]): boolean {
  if (gate.orientation === "v") {
    const col = gate.line;
    for (let r = gate.from; r <= gate.to; r++) {
      if (col > 0 && col <= (hTrail[0]?.length ?? 0) && hTrail[r]?.[col - 1] === 1) return true;
    }
  } else {
    const row = gate.line;
    for (let c = gate.from; c <= gate.to; c++) {
      if (row > 0 && row <= (vTrail?.length ?? 0) && vTrail[row - 1]?.[c] === 1) return true;
    }
  }
  return false;
}

export const computeSlalomProgress: ProgressCalculator = {
  puzzleType: 10,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as SlalomCanon;

    const { gates, gateCount } = canonRepr;
    if (gateCount === 0) return 0;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;

    const hTrail: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
    const vTrail: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols - 1) hTrail[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows - 1 && c < cols) vTrail[r][c] = val;
      }
    }

    let crossed = 0;
    for (const gate of gates) {
      if (isCrossed(gate, hTrail, vTrail)) crossed++;
    }

    return (crossed / gateCount) * 100;
  },
};
