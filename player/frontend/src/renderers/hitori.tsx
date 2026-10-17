import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { HitoriCanon, HitoriAnswer } from "../types/canon";
import HitoriBoard from "../components/HitoriBoard";

function extractUserValues(savedAnswer: HitoriAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.states) return {};
  const values: Record<string, number> = {};
  const { states } = savedAnswer;
  for (let r = 0; r < states.length; r++) {
    for (let c = 0; c < states[r].length; c++) {
      const v = states[r][c];
      if (v === 1 || v === 2) values[`${c},${r}`] = v;
    }
  }
  return values;
}

export const hitoriRenderer: PuzzleRenderer = {
  puzzleType: 26,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as HitoriCanon;
    const savedAnswer = state.playerGrid as unknown as HitoriAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <HitoriBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
