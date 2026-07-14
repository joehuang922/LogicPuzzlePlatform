import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { MasyuCanon, MasyuAnswer } from "../types/canon";
import MasyuBoard from "../components/MasyuBoard";

export const masyuRenderer: PuzzleRenderer = {
  puzzleType: 7,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MasyuCanon;
    const savedAnswer = state.playerGrid as unknown as MasyuAnswer | undefined;

    return (
      <MasyuBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        onAnswerChange={(answer) => {
          if (onValuesChange) {
            const values: Record<string, number> = {};
            const { h, v } = answer.edges;
            for (let r = 0; r < h.length; r++) {
              for (let c = 0; c < h[r].length; c++) {
                if (h[r][c] !== 0) values[`h:${r},${c}`] = h[r][c];
              }
            }
            for (let r = 0; r < v.length; r++) {
              for (let c = 0; c < v[r].length; c++) {
                if (v[r][c] !== 0) values[`v:${r},${c}`] = v[r][c];
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
