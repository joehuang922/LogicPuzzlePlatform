import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { YajilixCanon, YajilixAnswer } from "../types/canon";
import YajilixBoard from "../components/YajilixBoard";
import { toValues } from "../components/yajilixRules";

function extractUserValues(savedAnswer: YajilixAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.edges) return {};
  return toValues(savedAnswer.edges, savedAnswer.marks ?? []);
}

export const yajilixRenderer: PuzzleRenderer = {
  puzzleType: 46,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as YajilixCanon;
    const savedAnswer = state.playerGrid as unknown as YajilixAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <YajilixBoard
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
