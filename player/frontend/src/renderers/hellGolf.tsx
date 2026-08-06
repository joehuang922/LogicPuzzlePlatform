import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { HellGolfCanon, HellGolfAnswer } from "../types/canon";
import HellGolfBoard from "../components/HellGolfBoard";

export const hellGolfRenderer: PuzzleRenderer = {
  puzzleType: 19,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as HellGolfCanon;
    const cols = canonRepr.lakes[0].length;
    const savedAnswer = state.playerGrid as unknown as HellGolfAnswer | undefined;

    return (
      <HellGolfBoard
        canon={canonRepr}
        initialAnswer={savedAnswer?.trails ? savedAnswer : undefined}
        onAnswerChange={(answer) => {
          if (!onValuesChange) return;
          // Flatten trails to key -> number so the answer can persist. Each
          // move stop (past the origin) is `t:<ballIdx>:<stepIdx>` -> encoded
          // cell (r*cols + c + 1; +1 keeps every value non-zero).
          const values: Record<string, number> = {};
          answer.trails.forEach((trail, i) => {
            trail.path.slice(1).forEach(([r, c], step) => {
              values[`t:${i}:${step + 1}`] = r * cols + c + 1;
            });
          });
          onValuesChange(values);
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
