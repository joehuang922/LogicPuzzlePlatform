import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { TentaishowCanon, TentaishowAnswer } from "../types/canon";
import TentaishowBoard from "../components/TentaishowBoard";

function extractUserValues(savedAnswer: TentaishowAnswer | undefined): Record<string, number> {
  if (!savedAnswer?.edges) return {};
  const values: Record<string, number> = {};
  const { h, v } = savedAnswer.edges;
  if (h) {
    for (let r = 0; r < h.length; r++) {
      for (let c = 0; c < h[r].length; c++) {
        if (h[r][c] === 1) values[`h:${r},${c}`] = 1;
      }
    }
  }
  if (v) {
    for (let r = 0; r < v.length; r++) {
      for (let c = 0; c < v[r].length; c++) {
        if (v[r][c] === 1) values[`v:${r},${c}`] = 1;
      }
    }
  }
  return values;
}

export const tentaishowRenderer: PuzzleRenderer = {
  puzzleType: 20,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as TentaishowCanon;
    const savedAnswer = state.playerGrid as unknown as TentaishowAnswer | undefined;
    const initialUserValues = extractUserValues(savedAnswer);
    return <TentaishowBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
