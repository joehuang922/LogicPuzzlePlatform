import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { AkariCanon } from "../types/canon";
import AkariBoard from "../components/AkariBoard";

function extractUserValues(canon: AkariCanon, savedAnswer: { states?: number[][] } | undefined): Record<string, number> {
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

export const akariRenderer: PuzzleRenderer = {
  puzzleType: 18,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as AkariCanon;
    const savedAnswer = state.playerGrid as { states?: number[][] } | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <AkariBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} liveValidate={liveValidate} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
