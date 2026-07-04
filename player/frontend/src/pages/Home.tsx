import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPuzzles, listCollections, Collection } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";

export default function Home() {
  const [puzzles, setPuzzles] = useState<PuzzleDefinition[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listPuzzles(), listCollections()])
      .then(([puzzleRes, collectionRes]) => {
        setPuzzles(puzzleRes.puzzles as PuzzleDefinition[]);
        setCollections(collectionRes.collections);
      })
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

      {collections.length > 0 && (
        <>
          <h2>Collections</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.4rem" }}>Name</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.4rem" }}>Publisher</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.4rem" }}>Published</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "0.4rem" }}>Puzzles</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: "0.4rem" }}>{c.name}</td>
                  <td style={{ padding: "0.4rem" }}>{c.publisher ?? "—"}</td>
                  <td style={{ padding: "0.4rem" }}>{c.publishAt ?? "—"}</td>
                  <td style={{ textAlign: "right", padding: "0.4rem" }}>{c.puzzleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
