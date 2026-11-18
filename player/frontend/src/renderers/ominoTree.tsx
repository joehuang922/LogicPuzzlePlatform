import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { OminoTreeCanon, OminoTreeAnswer } from "../types/canon";
import OminoTreeBoard from "../components/OminoTreeBoard";
import { valuesFromWalls } from "../components/ominoTreeRules";

function extractUserValues(savedAnswer: OminoTreeAnswer | undefined): Record<string, number> {
  if (!savedAnswer?.grids) return {};
  return valuesFromWalls({ h: savedAnswer.grids.h ?? [], v: savedAnswer.grids.v ?? [] });
}

export const ominoTreeRenderer: PuzzleRenderer = {
  puzzleType: 38,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as OminoTreeCanon;
    const savedAnswer = state.playerGrid as unknown as OminoTreeAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <OminoTreeBoard
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
