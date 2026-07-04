import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import SudokuBoard from "../components/SudokuBoard";

export const sudokuRenderer: PuzzleRenderer = {
  puzzleType: 1,

  render(puzzle: PuzzleDefinition, _state: PuzzleState) {
    const canonRepr = typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr;
    return <SudokuBoard hints={canonRepr.hints} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
