import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import SudokuBoard from "../components/SudokuBoard";

export const sudokuRenderer: PuzzleRenderer = {
  puzzleType: "sudoku",

  render(puzzle: PuzzleDefinition, _state: PuzzleState) {
    const grid = typeof puzzle.grid === "string" ? JSON.parse(puzzle.grid) : puzzle.grid;
    return <SudokuBoard hints={grid.hints} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
