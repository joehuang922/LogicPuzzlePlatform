import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { YajilinCanon, YajilinAnswer } from "../types/canon";
import YajilinBoard from "../components/YajilinBoard";

export const yajilinRenderer: PuzzleRenderer = {
  puzzleType: 13,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as YajilinCanon;
    const savedAnswer = state.playerGrid as unknown as YajilinAnswer | undefined;

    return (
      <YajilinBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        onAnswerChange={(answer) => {
          if (onValuesChange) {
            const values: Record<string, number> = {};
            for (let r = 0; r < answer.blacks.length; r++) {
              for (let c = 0; c < answer.blacks[r].length; c++) {
                if (answer.blacks[r][c] !== 0) values[`b:${r},${c}`] = answer.blacks[r][c];
              }
            }
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
