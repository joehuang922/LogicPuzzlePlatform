import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { TetroChainKCanon, TetroChainKAnswer } from "../types/canon";
import TetroChainKBoard from "../components/TetroChainKBoard";
import { toValues } from "../components/tetroChainKRules";

function extractUserValues(savedAnswer: TetroChainKAnswer | undefined): Record<string, number> {
  if (!savedAnswer || !savedAnswer.states) return {};
  return toValues(savedAnswer.states);
}

export const tetroChainKRenderer: PuzzleRenderer = {
  puzzleType: 50,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as TetroChainKCanon;
    const savedAnswer = state.playerGrid as unknown as TetroChainKAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <TetroChainKBoard
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
