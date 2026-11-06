import { PuzzleDefinition, PuzzleRenderer } from "../types/puzzle";

const rendererRegistry = new Map<number, PuzzleRenderer>();

export function registerRenderer(renderer: PuzzleRenderer) {
  rendererRegistry.set(renderer.puzzleType, renderer);
}

export function getRenderer(puzzleType: number): PuzzleRenderer | undefined {
  return rendererRegistry.get(puzzleType);
}

interface PuzzleBoardProps {
  puzzle: PuzzleDefinition;
  initialAnswer?: Record<string, unknown> | null;
  /** Exact values to seed the board with (undo/redo); see PuzzleState.restoreValues. */
  restoreValues?: Record<string, number> | null;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  liveValidate?: boolean;
}

export default function PuzzleBoard({ puzzle, initialAnswer, restoreValues, onValuesChange, onComplete, liveValidate }: PuzzleBoardProps) {
  const renderer = getRenderer(puzzle.puzzleType);

  if (!renderer) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        <p>
          No renderer registered for puzzle type:{" "}
          <strong>{puzzle.puzzleType}</strong>
        </p>
        <p>Puzzle type support has not been implemented yet.</p>
      </div>
    );
  }

  return <>{renderer.render(puzzle, { puzzleId: puzzle.id, playerGrid: initialAnswer ?? {}, restoreValues: restoreValues ?? undefined, startedAt: "", lastUpdatedAt: "" }, onValuesChange, onComplete, liveValidate)}</>;
}
