import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { SudokuCanon } from "../types/canon";
import SudokuBoard from "../components/SudokuBoard";

function extractUserValues(hints: number[][], answer: number[][] | undefined): Record<string, number> {
  if (!answer) return {};
  const values: Record<string, number> = {};
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const hintVal = hints[row]?.[col] ?? 0;
      const ansVal = answer[row]?.[col] ?? 0;
      if (hintVal === 0 && ansVal > 0) {
        values[`${col},${row}`] = ansVal;
      }
    }
  }
  return values;
}

// Restore saved pencil marks. Tolerant of legacy snapshots with no `notes`.
function extractNotes(hints: number[][], notes: number[][][] | undefined): Record<string, number[]> {
  if (!notes) return {};
  const result: Record<string, number[]> = {};
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const hintVal = hints[row]?.[col] ?? 0;
      const cell = notes[row]?.[col];
      if (hintVal === 0 && Array.isArray(cell) && cell.length > 0) {
        result[`${col},${row}`] = cell.filter((d) => d >= 1 && d <= 9);
      }
    }
  }
  return result;
}

export const sudokuRenderer: PuzzleRenderer = {
  puzzleType: 1,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as SudokuCanon;
    const savedAnswer = state.playerGrid as { hints?: number[][]; notes?: number[][][] } | undefined;
    const initialUserValues = extractUserValues(canonRepr.hints, savedAnswer?.hints);
    const initialNotes = extractNotes(canonRepr.hints, savedAnswer?.notes);
    return <SudokuBoard hints={canonRepr.hints} initialUserValues={initialUserValues} initialNotes={initialNotes} onValuesChange={onValuesChange} onComplete={onComplete} liveValidate={liveValidate} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
