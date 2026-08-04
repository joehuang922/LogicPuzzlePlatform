import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { ChocoBananaCanon, ChocoBananaAnswer } from "../types/canon";
import ChocoBananaBoard from "../components/ChocoBananaBoard";

function extractUserValues(savedAnswer: ChocoBananaAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.states) return {};
  const values: Record<string, number> = {};
  const { states } = savedAnswer;
  for (let r = 0; r < states.length; r++) {
    for (let c = 0; c < states[r].length; c++) {
      const s = states[r][c];
      if (s === 1 || s === 2) values[`c:${c},${r}`] = s;
    }
  }
  return values;
}

export const chocoBananaRenderer: PuzzleRenderer = {
  puzzleType: 16,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as ChocoBananaCanon;
    const savedAnswer = state.playerGrid as unknown as ChocoBananaAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <ChocoBananaBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
