import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { ComboSudokuCanon } from "../types/canon";
import ComboSudokuBoard from "../components/ComboSudokuBoard";

interface AnswerSubboard {
  x: number;
  y: number;
  answers: number[][];
}

function extractUserValues(
  canon: ComboSudokuCanon,
  savedAnswer: { subboards?: AnswerSubboard[] } | undefined
): Record<string, number> {
  if (!savedAnswer?.subboards) return {};
  const values: Record<string, number> = {};
  for (const answerSb of savedAnswer.subboards) {
    const hintSb = canon.subboards.find((sb) => sb.x === answerSb.x && sb.y === answerSb.y);
    if (!hintSb) continue;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const hint = hintSb.hints[row]?.[col] ?? 0;
        const ans = answerSb.answers[row]?.[col] ?? 0;
        if (hint === 0 && ans > 0) {
          const globalCol = 3 * answerSb.x + col;
          const globalRow = 3 * answerSb.y + row;
          values[`${globalCol},${globalRow}`] = ans;
        }
      }
    }
  }
  return values;
}

export const comboSudokuRenderer: PuzzleRenderer = {
  puzzleType: 2,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, _onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as ComboSudokuCanon;
    const savedAnswer = state.playerGrid as { subboards?: AnswerSubboard[] } | undefined;
    const initialUserValues = extractUserValues(canonRepr, savedAnswer);
    return <ComboSudokuBoard subboards={canonRepr.subboards} initialUserValues={initialUserValues} onValuesChange={onValuesChange} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
