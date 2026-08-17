import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { RippleEffectCanon, RippleEffectAnswer } from "../types/canon";
import RippleEffectBoard from "../components/RippleEffectBoard";

function extractUserValues(
  canon: RippleEffectCanon,
  savedAnswer: RippleEffectAnswer | undefined
): Record<string, number> {
  if (!savedAnswer || !savedAnswer.numbers) return {};
  const values: Record<string, number> = {};
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] > 0) continue; // clue cells are fixed
      const val = savedAnswer.numbers[r]?.[c] ?? 0;
      if (val > 0) values[`${c},${r}`] = val;
    }
  }
  return values;
}

export const rippleEffectRenderer: PuzzleRenderer = {
  puzzleType: 25,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as RippleEffectCanon;
    const savedAnswer = state.playerGrid as unknown as RippleEffectAnswer | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <RippleEffectBoard canon={canonRepr} initialUserValues={initialUserValues} onValuesChange={onValuesChange} onComplete={onComplete} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
