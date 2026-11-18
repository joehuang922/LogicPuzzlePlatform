import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { MinusRoomCanon, MinusRoomAnswer } from "../types/canon";
import MinusRoomBoard from "../components/MinusRoomBoard";

/** Player values ("col,row" -> number) from a saved answer, givens left out. */
function extractUserValues(canon: MinusRoomCanon, savedAnswer: MinusRoomAnswer | undefined): Record<string, number> {
  const values: Record<string, number> = {};
  (savedAnswer?.numbers ?? []).forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > 0 && (canon.cells[r]?.[c] ?? 0) === 0) values[`${c},${r}`] = v;
    })
  );
  return values;
}

export const minusRoomRenderer: PuzzleRenderer = {
  puzzleType: 39,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MinusRoomCanon;
    const savedAnswer = state.playerGrid as unknown as MinusRoomAnswer | undefined;
    const initialUserValues = state.restoreValues ?? extractUserValues(canonRepr, savedAnswer);
    return (
      <MinusRoomBoard
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
