import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPuzzles } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";

export default function Home() {
  const [puzzles, setPuzzles] = useState<PuzzleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPuzzles()
      .then((res) => setPuzzles(res.puzzles as PuzzleDefinition[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading puzzles...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  if (puzzles.length === 0) {
    return (
      <div style={{ textAlign: "center", marginTop: "3rem" }}>
        <h2>No puzzles available</h2>
        <p>
          No puzzle types have been registered yet. Import puzzles via the API
          to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2>Available Puzzles</h2>
      <ul>
        {puzzles.map((p) => (
          <li key={p.id}>
            <Link to={`/play/${p.id}`}>
              {p.title ?? "Untitled"} — {p.puzzleTypeName} (difficulty: {p.difficulty}/5)
              {p.srcCollectionName && ` — from: ${p.srcCollectionName}`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
