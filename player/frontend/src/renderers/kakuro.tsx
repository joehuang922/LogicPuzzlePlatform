import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { KakuroCanon } from "../types/canon";
import KakuroBoard from "../components/KakuroBoard";

function extractUserValues(canon: KakuroCanon, savedAnswer: { values?: number[][] } | undefined): Record<string, number> {
  if (!savedAnswer?.values) return {};
  const values: Record<string, number> = {};
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c].type !== "empty") continue;
      const val = savedAnswer.values[r]?.[c] ?? 0;
      if (val >= 1 && val <= 9) {
        values[`${c},${r}`] = val;
      }
    }
  }
  return values;
}

export const kakuroRenderer: PuzzleRenderer = {
  puzzleType: 12,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as KakuroCanon;
    const savedAnswer = state.playerGrid as { values?: number[][] } | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <KakuroBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
