import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { SlalomCanon, SlalomAnswer } from "../types/canon";
import SlalomBoard from "../components/SlalomBoard";

export const slalomRenderer: PuzzleRenderer = {
  puzzleType: 10,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as SlalomCanon;
    const savedAnswer = state.playerGrid as unknown as SlalomAnswer | undefined;

    return (
      <SlalomBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        onAnswerChange={(answer) => {
          if (onValuesChange) {
            const values: Record<string, number> = {};
            const { h, v } = answer.trail;
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
