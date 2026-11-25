import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { HalfFullPaintCanon, HalfFullPaintAnswer } from "../types/canon";
import HalfFullPaintBoard from "../components/HalfFullPaintBoard";
import { toValues } from "../components/halfFullPaintRules";

function extractUserValues(savedAnswer: HalfFullPaintAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.states) return {};
  return toValues(savedAnswer.states);
}

export const halfFullPaintRenderer: PuzzleRenderer = {
  puzzleType: 48,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as HalfFullPaintCanon;
    const savedAnswer = state.playerGrid as unknown as HalfFullPaintAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <HalfFullPaintBoard
        canon={canonRepr}
        initialUserValues={initialUserValues}
        onValuesChange={onValuesChange}
        onComplete={onComplete}
        liveValidate={liveValidate}
      />
    );
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
