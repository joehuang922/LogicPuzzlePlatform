import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { PerfectLRingCanon, PerfectLRingAnswer } from "../types/canon";
import PerfectLRingBoard from "../components/PerfectLRingBoard";
import { edgesFromValues } from "../components/lRingRules";

/** Segments as userValues "h:r,c" / "v:r,c", as in Masyu and L-Ring. */
function valuesFromAnswer(answer: PerfectLRingAnswer): Record<string, number> {
  const values: Record<string, number> = {};
  const { h, v } = answer.edges;
  h.forEach((row, r) => row.forEach((x, c) => { if (x !== 0) values[`h:${r},${c}`] = x; }));
  v.forEach((row, r) => row.forEach((x, c) => { if (x !== 0) values[`v:${r},${c}`] = x; }));
  return values;
}

export const perfectLRingRenderer: PuzzleRenderer = {
  puzzleType: 42,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as PerfectLRingCanon;
    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const savedAnswer = state.playerGrid as unknown as PerfectLRingAnswer | undefined;
    // An undo/redo restore seeds the board from its exact values.
    const initialAnswer = state.restoreValues
      ? { edges: edgesFromValues(rows, cols, state.restoreValues) }
      : savedAnswer?.edges ? savedAnswer : null;

    return (
      <PerfectLRingBoard
        canon={canonRepr}
        initialAnswer={initialAnswer}
        liveValidate={liveValidate}
        onAnswerChange={(answer) => onValuesChange?.(valuesFromAnswer(answer))}
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
