import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { FillominoCanon, FillominoAnswer } from "../types/canon";
import FillominoBoard from "../components/FillominoBoard";

function extractUserValues(canon: FillominoCanon, savedAnswer: FillominoAnswer | undefined): Record<string, number> {
  if (!savedAnswer) return {};
  const values: Record<string, number> = {};
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  if (savedAnswer.numbers) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (canon.cells[r][c] > 0) continue;
        const val = savedAnswer.numbers[r]?.[c] ?? 0;
        if (val > 0) values[`c:${c},${r}`] = val;
      }
    }
  }
  if (savedAnswer.edges) {
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
  }
  return values;
}

export const fillominoRenderer: PuzzleRenderer = {
  puzzleType: 14,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as FillominoCanon;
    const savedAnswer = state.playerGrid as unknown as FillominoAnswer | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <FillominoBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
