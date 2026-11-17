import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { ZebraRopeCanon, ZebraRopeAnswer } from "../types/canon";
import ZebraRopeBoard from "../components/ZebraRopeBoard";

function extractUserValues(savedAnswer: ZebraRopeAnswer | undefined): Record<string, number> {
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

export const zebraRopeRenderer: PuzzleRenderer = {
  puzzleType: 36,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as ZebraRopeCanon;
    const savedAnswer = state.playerGrid as unknown as ZebraRopeAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <ZebraRopeBoard
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
