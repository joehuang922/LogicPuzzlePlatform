import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { NonogramCanon, NonogramAnswer } from "../types/canon";
import NonogramBoard from "../components/NonogramBoard";

export const nonogramRenderer: PuzzleRenderer = {
  puzzleType: 6,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as NonogramCanon;
    const savedAnswer = state.playerGrid as unknown as NonogramAnswer | undefined;

    return (
      <NonogramBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        onAnswerChange={(answer) => {
          if (onValuesChange) {
            const values: Record<string, number> = {};
            for (let r = 0; r < answer.cells.length; r++) {
              for (let c = 0; c < answer.cells[r].length; c++) {
                if (answer.cells[r][c] !== 0) {
                  values[`${c},${r}`] = answer.cells[r][c];
                }
              }
            }
            onValuesChange(values);
          }
        }}
        onComplete={onComplete}
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
