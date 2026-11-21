import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { CountryRoadCanon, CountryRoadAnswer } from "../types/canon";
import CountryRoadBoard from "../components/CountryRoadBoard";
import { toValues } from "../components/countryRoadRules";

function extractUserValues(savedAnswer: CountryRoadAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.edges) return {};
  return toValues(savedAnswer.edges, savedAnswer.marks ?? []);
}

export const countryRoadRenderer: PuzzleRenderer = {
  puzzleType: 41,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as CountryRoadCanon;
    const savedAnswer = state.playerGrid as unknown as CountryRoadAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <CountryRoadBoard
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
