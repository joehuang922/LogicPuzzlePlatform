import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { MelonPieCanon, MelonPieAnswer } from "../types/canon";
import MelonPieBoard from "../components/MelonPieBoard";
import { toValues } from "../components/melonPieRules";

function extractUserValues(savedAnswer: MelonPieAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.edges) return {};
  return toValues(savedAnswer.edges);
}

export const melonPieRenderer: PuzzleRenderer = {
  puzzleType: 49,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MelonPieCanon;
    const savedAnswer = state.playerGrid as unknown as MelonPieAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <MelonPieBoard
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
