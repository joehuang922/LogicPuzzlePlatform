import { PuzzleDefinition, PuzzleRenderer, PuzzleState, PlayerAction } from "../types/puzzle";
import { PicturesqueMazeAnswer } from "../types/canon";
import PicturesqueMazeBoard from "../components/PicturesqueMazeBoard";
import { mazeEdgesFromValues, mazeToValues, parseMazeCanon } from "../components/picturesqueMazeRules";

export const picturesqueMazeRenderer: PuzzleRenderer = {
  puzzleType: 44,

  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean) {
    const canon = parseMazeCanon(puzzle.canonRepr);
    const savedAnswer = state.playerGrid as unknown as PicturesqueMazeAnswer | undefined;
    const initialAnswer: PicturesqueMazeAnswer | undefined = state.restoreValues
      ? { edges: mazeEdgesFromValues(canon.width, canon.height, state.restoreValues) }
      : savedAnswer?.edges
        ? savedAnswer
        : undefined;
    return (
      <PicturesqueMazeBoard
        canon={canon}
        initialAnswer={initialAnswer}
        onAnswerChange={(answer) => onValuesChange?.(mazeToValues(answer.edges))}
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
