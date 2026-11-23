import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { MannequinGate2Canon, MannequinGate2Answer } from "../types/canon";
import MannequinGate2Board from "../components/MannequinGate2Board";
import { cellKey } from "../components/mannequinGate2Rules";

/** userValues from a saved answer: shaded cells only (marks aren't saved). */
function extractUserValues(saved: MannequinGate2Answer | undefined): Record<string, number> {
  const values: Record<string, number> = {};
  saved?.shaded?.forEach((row, r) => row.forEach((v, c) => { if (v === 1) values[cellKey(r, c)] = 1; }));
  return values;
}

export const mannequinGate2Renderer: PuzzleRenderer = {
  puzzleType: 43,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as MannequinGate2Canon;
    const savedAnswer = state.playerGrid as unknown as MannequinGate2Answer | undefined;
    // The saved answer keeps only shading; an undo/redo restore keeps the marks too.
    const initialUserValues = state.restoreValues ?? extractUserValues(savedAnswer);
    return (
      <MannequinGate2Board
        canon={canonRepr}
        initialUserValues={initialUserValues}
        onValuesChange={onValuesChange}
        onComplete={onComplete}
        liveValidate={liveValidate}
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
