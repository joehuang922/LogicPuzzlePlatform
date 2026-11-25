import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { MajorityYajilixCanon, MajorityYajilixAnswer } from "../types/canon";
import MajorityYajilixBoard from "../components/MajorityYajilixBoard";
import { toValues } from "../components/majorityYajilixRules";

function extractUserValues(savedAnswer: MajorityYajilixAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.edges) return {};
  return toValues(savedAnswer.edges, savedAnswer.marks ?? []);
}

export const majorityYajilixRenderer: PuzzleRenderer = {
  puzzleType: 47,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MajorityYajilixCanon;
    const savedAnswer = state.playerGrid as unknown as MajorityYajilixAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <MajorityYajilixBoard
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
