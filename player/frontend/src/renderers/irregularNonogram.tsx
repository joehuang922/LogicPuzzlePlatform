import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { IrregularNonogramAnswer } from "../types/canon";
import IrregularNonogramBoard from "../components/IrregularNonogramBoard";
import { irregularNonogramValues, parseIrregularNonogramCanon } from "../components/irregularNonogramRules";

export const irregularNonogramRenderer: PuzzleRenderer = {
  puzzleType: 45,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canon = parseIrregularNonogramCanon(puzzle.canonRepr);
    const saved = state.playerGrid as unknown as IrregularNonogramAnswer | undefined;
    return (
      <IrregularNonogramBoard
        canon={canon}
        initialUserValues={state.restoreValues ?? irregularNonogramValues(saved)}
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
