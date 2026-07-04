import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import ComboSudokuBoard from "../components/ComboSudokuBoard";

export const comboSudokuRenderer: PuzzleRenderer = {
  puzzleType: "combo-sudoku",

  render(puzzle: PuzzleDefinition, _state: PuzzleState) {
    const grid = typeof puzzle.grid === "string" ? JSON.parse(puzzle.grid) : puzzle.grid;
    return <ComboSudokuBoard subboards={grid.subboards} />;
  },

  handleInput(state: PuzzleState, _action: PlayerAction) {
    return state;
  },

  checkSolution(_state: PuzzleState, _puzzle: PuzzleDefinition) {
    return false;
  },
};
