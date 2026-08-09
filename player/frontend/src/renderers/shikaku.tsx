import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { ShikakuCanon, ShikakuAnswer } from "../types/canon";
import ShikakuBoard from "../components/ShikakuBoard";

function extractUserValues(
  canon: ShikakuCanon,
  savedAnswer: ShikakuAnswer | undefined
): Record<string, number> {
  if (!savedAnswer || !savedAnswer.rects) return {};
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const values: Record<string, number> = {};
  for (const rect of savedAnswer.rects) {
    const { r, c, w, h } = rect;
    if (r >= 0 && c >= 0 && w >= 1 && h >= 1 && r + h <= rows && c + w <= cols) {
      values[`rect:${r},${c}`] = w * 1000 + h;
    }
  }
  return values;
}

export const shikakuRenderer: PuzzleRenderer = {
  puzzleType: 22,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as ShikakuCanon;
    const savedAnswer = state.playerGrid as unknown as ShikakuAnswer | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <ShikakuBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
