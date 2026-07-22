import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { ShakashakaCanon } from "../types/canon";
import ShakashakaBoard from "../components/ShakashakaBoard";

function extractUserValues(canon: ShakashakaCanon, savedAnswer: { states?: number[][] } | undefined): Record<string, number> {
  if (!savedAnswer?.states) return {};
  const values: Record<string, number> = {};
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] !== -1) continue;
      const state = savedAnswer.states[r]?.[c] ?? 0;
      if (state !== 0) {
        values[`${c},${r}`] = state;
      }
    }
  }
  return values;
}

export const shakashakaRenderer: PuzzleRenderer = {
  puzzleType: 11,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as ShakashakaCanon;
    const savedAnswer = state.playerGrid as { states?: number[][] } | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <ShakashakaBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
