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

export const sudokuRenderer: PuzzleRenderer = {
  puzzleType: 1,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as SudokuCanon;
    const answerGrid = (state.playerGrid as { hints?: number[][] })?.hints;
    const initialUserValues = extractUserValues(canonRepr.hints, answerGrid);
    return <SudokuBoard hints={canonRepr.hints} initialUserValues={initialUserValues} onValuesChange={onValuesChange} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
