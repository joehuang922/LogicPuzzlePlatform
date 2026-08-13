import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { NorinoriCanon, NorinoriAnswer } from "../types/canon";
import NorinoriBoard from "../components/NorinoriBoard";

function extractUserValues(savedAnswer: NorinoriAnswer | undefined): Record<string, number> {
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
