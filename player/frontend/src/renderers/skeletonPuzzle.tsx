import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { SkeletonPuzzleCanon, SkeletonPuzzleAnswer } from "../types/canon";
import SkeletonPuzzleBoard from "../components/SkeletonPuzzleBoard";
import { findSlots } from "../components/skeletonPuzzleRules";

export const skeletonPuzzleRenderer: PuzzleRenderer = {
  puzzleType: 35,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void) {
    const canonRepr = (typeof puzzle.canonRepr === "string" ? JSON.parse(puzzle.canonRepr) : puzzle.canonRepr) as SkeletonPuzzleCanon;
    const savedAnswer = state.playerGrid as unknown as SkeletonPuzzleAnswer | undefined;
    const slots = findSlots(canonRepr.cells);

    return (
      <SkeletonPuzzleBoard
        canon={canonRepr}
        initialAnswer={savedAnswer}
        onAnswerChange={(answer) => {
          if (!onValuesChange) return;
          // userValues "p:<slot>" -> word index + 1, slots numbered from the canon.
          const values: Record<string, number> = {};
          for (const p of answer.placements) {
            const slot = slots.find((s) => s.r === p.r && s.c === p.c && s.dir === p.dir);
            if (slot) values[`p:${slot.index}`] = p.word + 1;
          }
          onValuesChange(values);
        }}
        onComplete={onComplete}
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
