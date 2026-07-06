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
}

export default function PuzzleBoard({ puzzle, initialAnswer }: PuzzleBoardProps) {
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

  return <>{renderer.render(puzzle, { puzzleId: puzzle.id, playerGrid: initialAnswer ?? {}, startedAt: "", lastUpdatedAt: "" })}</>;
}
