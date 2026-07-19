import { PuzzleDefinition } from "../types/puzzle";
import { computeSudokuProgress } from "./sudoku";
import { computeComboSudokuProgress } from "./comboSudoku";
import { computeNurimazeProgress } from "./nurimaze";
import { computeDoubleChocoProgress } from "./doubleChoco";
import { computeSlitherlinkProgress } from "./slitherlink";
import { computeNonogramProgress } from "./nonogram";
import { computePencilsProgress } from "./pencils";
import { computeNuritwinProgress } from "./nuritwin";
import { computeSlalomProgress } from "./slalom";

export interface ProgressCalculator {
  puzzleType: number;
  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number;
}

const progressRegistry = new Map<number, ProgressCalculator>();

function register(calc: ProgressCalculator) {
  progressRegistry.set(calc.puzzleType, calc);
}

register(computeSudokuProgress);
register(computeComboSudokuProgress);
register(computeNurimazeProgress);
register(computeDoubleChocoProgress);
register(computeSlitherlinkProgress);
register(computeNonogramProgress);
register(computePencilsProgress);
register(computeNuritwinProgress);
register(computeSlalomProgress);

export function computeProgress(
  puzzle: PuzzleDefinition,
  userValues: Record<string, number>
): number {
  const calc = progressRegistry.get(puzzle.puzzleType);
  if (!calc) return 0;
  return calc.compute(puzzle, userValues);
}
