import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { IrregularNonogramAnswer } from "../types/canon";
import IrregularNonogramBoard from "../components/IrregularNonogramBoard";
import { parseIrregularNonogramCanon } from "../components/irregularNonogramRules";

/** "col,row" -> 1 values from a saved answer (crosses aren't saved, as in Nonogram). */
function valuesFromAnswer(answer: IrregularNonogramAnswer | undefined): Record<string, number> {
  const values: Record<string, number> = {};
  answer?.cells?.forEach((row, r) => row.forEach((v, c) => { if (v === 1) values[`${c},${r}`] = 1; }));
  return values;
}

export const irregularNonogramRenderer: PuzzleRenderer = {
  puzzleType: 45,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canon = parseIrregularNonogramCanon(puzzle.canonRepr);
    const saved = state.playerGrid as unknown as IrregularNonogramAnswer | undefined;
    return (
      <IrregularNonogramBoard
        canon={canon}
        initialUserValues={state.restoreValues ?? valuesFromAnswer(saved)}
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
