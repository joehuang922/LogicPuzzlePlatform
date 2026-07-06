import { useEffect, useState, useRef } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { getPuzzle } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";
import PuzzleBoard from "../components/PuzzleBoard";
import { DIFFICULTY_LABELS } from "../constants";

interface TimerProps {
  startOffset?: number;
}

function Timer({ startOffset = 0 }: TimerProps) {
  const [elapsed, setElapsed] = useState(startOffset);
  const startRef = useRef(Date.now() - startOffset * 1000);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const display = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <span style={{ fontFamily: "monospace", fontSize: "1.1rem", padding: "0.25rem 0.5rem", background: "#f5f5f5", borderRadius: 4, border: "1px solid #ddd" }}>
      {display}
    </span>
  );
}

export default function Play() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [puzzle, setPuzzle] = useState<PuzzleDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navState = location.state as { currentAnswer?: Record<string, unknown>; elapsedSeconds?: number } | null;
  const initialAnswer = navState?.currentAnswer ?? null;
  const elapsedOffset = navState?.elapsedSeconds ?? 0;

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
      <h2>{puzzle.title ?? "Untitled"}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
        <p style={{ margin: 0 }}>
          Type: {puzzle.puzzleTypeName} | Difficulty: {DIFFICULTY_LABELS[puzzle.difficulty] || `${puzzle.difficulty}/5`}
          {puzzle.author && ` | Author: ${puzzle.author}`}
          {puzzle.srcCollectionName && ` | Collection: ${puzzle.srcCollectionName}`}
        </p>
        <Timer startOffset={elapsedOffset} />
      </div>
      <PuzzleBoard puzzle={puzzle} initialAnswer={initialAnswer} />
    </div>
  );
}
