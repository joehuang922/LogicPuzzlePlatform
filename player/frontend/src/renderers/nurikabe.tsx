import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { NurikabeCanon, NurikabeAnswer } from "../types/canon";
import NurikabeBoard from "../components/NurikabeBoard";

function extractUserValues(savedAnswer: NurikabeAnswer | undefined): Record<string, number> {
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

export const nurikabeRenderer: PuzzleRenderer = {
  puzzleType: 24,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as NurikabeCanon;
    const savedAnswer = state.playerGrid as unknown as NurikabeAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <NurikabeBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
