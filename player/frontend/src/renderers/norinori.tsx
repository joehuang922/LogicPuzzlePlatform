import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { NorinoriCanon, NorinoriAnswer } from "../types/canon";
import NorinoriBoard from "../components/NorinoriBoard";

function extractUserValues(savedAnswer: NorinoriAnswer | undefined): Record<string, number> {
  if (!savedAnswer) return {};
  // Prefer the tri-state `states` grid; fall back to the legacy `shaded` (shaded-only) shape.
  const grid = savedAnswer.states ?? savedAnswer.shaded;
  if (!grid) return {};
  const values: Record<string, number> = {};
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const state = grid[r][c];
      if (state === 1 || state === 2) values[`c:${c},${r}`] = state;
    }
  }
  return values;
}

export const norinoriRenderer: PuzzleRenderer = {
  puzzleType: 23,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as NorinoriCanon;
    const savedAnswer = state.playerGrid as unknown as NorinoriAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <NorinoriBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
