import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { UnequalSudokuCanon, UnequalSudokuAnswer } from "../types/canon";
import UnequalSudokuBoard from "../components/UnequalSudokuBoard";

// Saved answers merge givens with the player's digits; restore only the player's.
function extractUserValues(hints: number[][], answer: number[][] | undefined): Record<string, number> {
  if (!answer) return {};
  const values: Record<string, number> = {};
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const ansVal = answer[row]?.[col] ?? 0;
      if ((hints[row]?.[col] ?? 0) === 0 && ansVal > 0) values[`${col},${row}`] = ansVal;
    }
  }
  return values;
}

function extractNotes(hints: number[][], notes: number[][][] | undefined): Record<string, number[]> {
  if (!notes) return {};
  const result: Record<string, number[]> = {};
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const cell = notes[row]?.[col];
      if ((hints[row]?.[col] ?? 0) === 0 && Array.isArray(cell) && cell.length > 0) {
        result[`${col},${row}`] = cell.filter((d) => d >= 1 && d <= 9);
      }
    }
  }
  return result;
}

export const unequalSudokuRenderer: PuzzleRenderer = {
  puzzleType: 29,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canon = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as UnequalSudokuCanon;
    const saved = state.playerGrid as unknown as UnequalSudokuAnswer | undefined;
    return (
      <UnequalSudokuBoard
        canon={canon}
        initialUserValues={extractUserValues(canon.hints, saved?.hints)}
        initialNotes={extractNotes(canon.hints, saved?.notes)}
        onValuesChange={onValuesChange}
        onComplete={onComplete}
        liveValidate={liveValidate}
      />
    );
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
