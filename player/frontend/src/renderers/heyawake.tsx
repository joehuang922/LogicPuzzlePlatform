import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { HeyawakeCanon, HeyawakeAnswer } from "../types/canon";
import HeyawakeBoard from "../components/HeyawakeBoard";

function extractUserValues(savedAnswer: HeyawakeAnswer | undefined): Record<string, number> {
  if (!savedAnswer?.states) return {};
  const values: Record<string, number> = {};
  const { states } = savedAnswer;
  for (let r = 0; r < states.length; r++) {
    for (let c = 0; c < states[r].length; c++) {
      if (states[r][c] !== 0) values[`${c},${r}`] = states[r][c];
    }
  }
  return values;
}

export const heyawakeRenderer: PuzzleRenderer = {
  puzzleType: 21,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as HeyawakeCanon;
    const savedAnswer = state.playerGrid as unknown as HeyawakeAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <HeyawakeBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
