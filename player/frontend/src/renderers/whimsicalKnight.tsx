import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { WhimsicalKnightCanon, WhimsicalKnightAnswer } from "../types/canon";
import WhimsicalKnightBoard from "../components/WhimsicalKnightBoard";
import { segmentKey } from "../components/whimsicalKnightRules";

function extractUserValues(savedAnswer: WhimsicalKnightAnswer | undefined): Record<string, number> {
  const values: Record<string, number> = {};
  for (const seg of savedAnswer?.segments ?? []) {
    if (Array.isArray(seg) && seg.length === 2) values[segmentKey(seg[0], seg[1])] = 1;
  }
  return values;
}

export const whimsicalKnightRenderer: PuzzleRenderer = {
  puzzleType: 37,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as WhimsicalKnightCanon;
    const savedAnswer = state.playerGrid as unknown as WhimsicalKnightAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <WhimsicalKnightBoard
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
