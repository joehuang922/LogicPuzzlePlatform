import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { PencilsCanon, PencilsAnswer } from "../types/canon";
import PencilsBoard from "../components/PencilsBoard";

export const pencilsRenderer: PuzzleRenderer = {
  puzzleType: 8,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as PencilsCanon;
    const savedAnswer = state.playerGrid as unknown as PencilsAnswer | undefined;

    return (
      <PencilsBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        onAnswerChange={(answer) => {
          if (onValuesChange) {
            const values: Record<string, number> = {};
            const { h: th, v: tv } = answer.trails;
            for (let r = 0; r < th.length; r++) {
              for (let c = 0; c < th[r].length; c++) {
                if (th[r][c] !== 0) values[`th:${r},${c}`] = th[r][c];
              }
            }
            for (let r = 0; r < tv.length; r++) {
              for (let c = 0; c < tv[r].length; c++) {
                if (tv[r][c] !== 0) values[`tv:${r},${c}`] = tv[r][c];
              }
            }
            for (let r = 0; r < answer.heads.length; r++) {
              for (let c = 0; c < answer.heads[r].length; c++) {
                if (answer.heads[r][c] !== 0) values[`hd:${r},${c}`] = answer.heads[r][c];
              }
            }
            const { h: eh, v: ev } = answer.edges;
            for (let r = 0; r < eh.length; r++) {
              for (let c = 0; c < eh[r].length; c++) {
                if (eh[r][c] !== 0) values[`eh:${r},${c}`] = eh[r][c];
              }
            }
            for (let r = 0; r < ev.length; r++) {
              for (let c = 0; c < ev[r].length; c++) {
                if (ev[r][c] !== 0) values[`ev:${r},${c}`] = ev[r][c];
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
