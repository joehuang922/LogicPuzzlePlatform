import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getPuzzle } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";
import PuzzleBoard from "../components/PuzzleBoard";

export default function Play() {
  const { id } = useParams<{ id: string }>();
  const [puzzle, setPuzzle] = useState<PuzzleDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getPuzzle(id)
      .then((res) => setPuzzle(res.puzzle as PuzzleDefinition))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading puzzle...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!puzzle) return <p>Puzzle not found.</p>;

  return (
    <div>
      <Link to="/">&larr; Back to puzzles</Link>
      <h2>{puzzle.title ?? `${puzzle.puzzleType} puzzle`}</h2>
      <PuzzleBoard puzzle={puzzle} />
    </div>
  );
}
