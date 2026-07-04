import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import ComboSudokuBoard from "../components/ComboSudokuBoard";

export const comboSudokuRenderer: PuzzleRenderer = {
  puzzleType: 2,

  render(puzzle: PuzzleDefinition, _state: PuzzleState) {
    const canonRepr = typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr;
    return <ComboSudokuBoard subboards={canonRepr.subboards} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
