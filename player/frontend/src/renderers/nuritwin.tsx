import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { NuritwinCanon } from "../types/canon";
import NuritwinBoard from "../components/NuritwinBoard";

function extractUserValues(canon: NuritwinCanon, savedAnswer: { states?: number[][] } | undefined): Record<string, number> {
  if (!savedAnswer?.states) return {};
  const values: Record<string, number> = {};
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const state = savedAnswer.states[r]?.[c] ?? 0;
      if (state !== 0) {
        values[`${c},${r}`] = state;
      }
    }
  }
  return values;
}

export const nuritwinRenderer: PuzzleRenderer = {
  puzzleType: 9,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as NuritwinCanon;
    const savedAnswer = state.playerGrid as { states?: number[][] } | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <NuritwinBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
