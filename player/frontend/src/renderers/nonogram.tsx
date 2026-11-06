import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { NonogramCanon, NonogramAnswer } from "../types/canon";
import NonogramBoard from "../components/NonogramBoard";

/** Board cells (0 empty, 1 filled, 2 crossed) from "col,row" values. */
function answerFromValues(canon: NonogramCanon, values: Record<string, number>): NonogramAnswer {
  const cells = canon.rowClues.map(() => canon.colClues.map(() => 0));
  for (const [key, v] of Object.entries(values)) {
    const [c, r] = key.split(",").map(Number);
    if (cells[r] && c >= 0 && c < cells[r].length) cells[r][c] = v;
  }
  return { cells };
}

export const nonogramRenderer: PuzzleRenderer = {
  puzzleType: 6,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as NonogramCanon;
    // The saved answer keeps only filled cells; an undo/redo restore keeps crosses too.
    const savedAnswer = state.restoreValues
      ? answerFromValues(canonRepr, state.restoreValues)
      : (state.playerGrid as unknown as NonogramAnswer | undefined);
    // Gate-computed solution for the reveal hint fallback. Stored as { cells: grid }.
    const solutionRepr = (typeof puzzle.solutionRepr === "string" ? JSON.parse(puzzle.solutionRepr) : puzzle.solutionRepr) as { cells?: number[][] } | null | undefined;

    return (
      <NonogramBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        solution={solutionRepr?.cells ?? null}
        liveValidate={liveValidate}
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
