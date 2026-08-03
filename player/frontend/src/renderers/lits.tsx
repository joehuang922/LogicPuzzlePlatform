import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { LitsCanon, LitsAnswer } from "../types/canon";
import LitsBoard from "../components/LitsBoard";

function extractUserValues(savedAnswer: LitsAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.shaded) return {};
  const values: Record<string, number> = {};
  const { shaded } = savedAnswer;
  for (let r = 0; r < shaded.length; r++) {
    for (let c = 0; c < shaded[r].length; c++) {
      if (shaded[r][c] === 1) values[`c:${c},${r}`] = 1;
    }
  }
  return values;
}

export const litsRenderer: PuzzleRenderer = {
  puzzleType: 15,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as LitsCanon;
    const savedAnswer = state.playerGrid as unknown as LitsAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <LitsBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
