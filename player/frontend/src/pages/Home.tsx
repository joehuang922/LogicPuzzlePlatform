import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listPuzzles, listCollections, listPuzzleTypes, listAttempts, createAttempt, getAttemptSnapshot, Collection, Attempt, PuzzleType, Puzzle } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";
import { DIFFICULTY_LABELS } from "../constants";
import { extractAnswer } from "../extractors";

const HARDCODED_PLAYER_ID = 1;

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function CollectionPuzzleList({
  puzzles,
  puzzleTypes,
  attemptedIds,
  onPuzzleClick,
}: {
  puzzles: Puzzle[];
  puzzleTypes: PuzzleType[];
  attemptedIds: Set<string>;
  onPuzzleClick: (puzzle: Puzzle) => void;
}) {
  const puzzleTypeMap = Object.fromEntries(puzzleTypes.map((pt) => [pt.id, pt.name]));
  const groupedByType = puzzles.reduce<Record<number, Puzzle[]>>((acc, p) => {
    (acc[p.puzzleType] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(groupedByType).map(([typeId, items]) => (
        <div key={typeId} style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontWeight: "bold", fontSize: "0.85rem", padding: "0.3rem 0.5rem", background: "#e8e8e8", borderRadius: 4, marginBottom: "0.25rem" }}>
            {puzzleTypeMap[Number(typeId)] || `Type ${typeId}`} ({items.length})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "0.3rem" }}>Title</th>
                <th style={{ padding: "0.3rem" }}>Difficulty</th>
                <th style={{ padding: "0.3rem" }}>Author</th>
                <th style={{ padding: "0.3rem" }}>Size</th>
                <th style={{ padding: "0.3rem", width: 30, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onPuzzleClick(p)}
                  style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                >
                  <td style={{ padding: "0.3rem" }}>{p.title || "(none)"}</td>
                  <td style={{ padding: "0.3rem" }}>{DIFFICULTY_LABELS[p.difficulty] || String(p.difficulty)}</td>
                  <td style={{ padding: "0.3rem" }}>{p.author || "N/A"}</td>
                  <td style={{ padding: "0.3rem" }}>{p.width && p.height ? `${p.width} x ${p.height}` : "—"}</td>
                  <td style={{ padding: "0.3rem", textAlign: "center", color: "green" }}>
                    {attemptedIds.has(p.id) && "✓"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState<PuzzleDefinition[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [puzzleTypes, setPuzzleTypes] = useState<PuzzleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleDefinition | null>(null);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [showAttemptsDialog, setShowAttemptsDialog] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [hasPreviousAttempts, setHasPreviousAttempts] = useState(false);

  const [expandedCollectionId, setExpandedCollectionId] = useState<number | null>(null);
  const [collectionPuzzles, setCollectionPuzzles] = useState<Puzzle[]>([]);
  const [loadingCollectionPuzzles, setLoadingCollectionPuzzles] = useState(false);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([listPuzzles(), listCollections(), listPuzzleTypes()])
      .then(([puzzleRes, collectionRes, ptRes]) => {
        setPuzzles(puzzleRes.puzzles as PuzzleDefinition[]);
        setCollections(collectionRes.collections);
        setPuzzleTypes(ptRes.puzzleTypes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handlePuzzleClick(puzzle: PuzzleDefinition) {
    setSelectedPuzzle(puzzle);
    setShowChoiceDialog(true);
    setHasPreviousAttempts(false);
    const res = await listAttempts(HARDCODED_PLAYER_ID, puzzle.id);
    setHasPreviousAttempts(res.attempts.length > 0);
  }

  async function handleNewAttempt() {
    if (!selectedPuzzle) return;
    const initialAnswer = extractAnswer(selectedPuzzle, {});
    const result = await createAttempt({
      player: HARDCODED_PLAYER_ID,
      question: selectedPuzzle.id,
      initialAnswer,
    });
    setShowChoiceDialog(false);
    navigate(`/play/${selectedPuzzle.id}?attempt=${result.attemptId}`);
  }

  async function handleExpandCollection(collectionId: number) {
    if (expandedCollectionId === collectionId) {
      setExpandedCollectionId(null);
      return;
    }
    setExpandedCollectionId(collectionId);
    setLoadingCollectionPuzzles(true);
    try {
      const res = await listPuzzles({ srcCollection: collectionId });
      setCollectionPuzzles(res.puzzles);
      const attempted = new Set<string>();
      await Promise.all(
        res.puzzles.map(async (p) => {
          const attRes = await listAttempts(HARDCODED_PLAYER_ID, p.id, { finished: true });
          if (attRes.attempts.length > 0) attempted.add(p.id);
        })
      );
      setAttemptedPuzzleIds(attempted);
    } finally {
      setLoadingCollectionPuzzles(false);
    }
  }

  function handleCollectionPuzzleClick(puzzle: Puzzle) {
    setSelectedPuzzle(puzzle as unknown as PuzzleDefinition);
    setShowChoiceDialog(true);
  }

  async function handleLoadPrevious() {
    if (!selectedPuzzle) return;
    setAttemptsLoading(true);
    try {
      const res = await listAttempts(HARDCODED_PLAYER_ID, selectedPuzzle.id);
      setAttempts(res.attempts);
      setSelectedAttemptId(null);
      setShowChoiceDialog(false);
      setShowAttemptsDialog(true);
    } finally {
      setAttemptsLoading(false);
    }
  }

  async function handleConfirmLoadAttempt() {
    if (!selectedPuzzle || !selectedAttemptId) return;
    const res = await getAttemptSnapshot(selectedAttemptId);
    const snapshot = res.snapshot;
    setShowAttemptsDialog(false);
    navigate(`/play/${selectedPuzzle.id}?attempt=${selectedAttemptId}`, {
      state: {
        currentAnswer: typeof snapshot.currentAnswer === "string"
          ? JSON.parse(snapshot.currentAnswer)
          : snapshot.currentAnswer,
        elapsedSeconds: snapshot.elapsedSeconds,
      },
    });
  }

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
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); handlePuzzleClick(p); }}
              style={{ cursor: "pointer" }}
            >
              {p.title ?? "Untitled"} — {p.puzzleTypeName} ({DIFFICULTY_LABELS[p.difficulty] || `${p.difficulty}/5`})
              {p.srcCollectionName && ` — from: ${p.srcCollectionName}`}
            </a>
          </li>
        ))}
      </ul>

      {collections.length > 0 && (
        <>
          <h2>Collections</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Name</th>
                <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Publisher</th>
                <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Publish Date</th>
                <th style={{ textAlign: "right", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Puzzles</th>
              </tr>
            </thead>
            <tbody>
              {[...collections].sort((a, b) => {
                if (!a.publishAt && !b.publishAt) return 0;
                if (!a.publishAt) return 1;
                if (!b.publishAt) return -1;
                return b.publishAt.localeCompare(a.publishAt);
              }).map((c) => (
                <>
                  <tr
                    key={c.id}
                    onClick={() => handleExpandCollection(c.id)}
                    style={{ cursor: "pointer", borderBottom: "1px solid #eee", background: expandedCollectionId === c.id ? "#f0f7ff" : undefined }}
                  >
                    <td style={{ padding: "0.5rem" }}>{c.name}</td>
                    <td style={{ padding: "0.5rem" }}>{c.publisher ?? "—"}</td>
                    <td style={{ padding: "0.5rem" }}>{c.publishAt ?? "—"}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem" }}>{c.puzzleCount}</td>
                  </tr>
                  {expandedCollectionId === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={4} style={{ padding: "0.75rem 0.5rem", background: "#fafafa" }}>
                        {loadingCollectionPuzzles ? (
                          <p style={{ margin: 0, fontSize: "0.85rem" }}>Loading questions...</p>
                        ) : collectionPuzzles.length === 0 ? (
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>No questions in this collection.</p>
                        ) : (
                          <CollectionPuzzleList
                            puzzles={collectionPuzzles}
                            puzzleTypes={puzzleTypes}
                            attemptedIds={attemptedPuzzleIds}
                            onPuzzleClick={handleCollectionPuzzleClick}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Choice dialog: New Attempt vs Load Previous */}
      {showChoiceDialog && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <h3>Start Puzzle: {selectedPuzzle?.title ?? "Untitled"}</h3>
            <p>How would you like to proceed?</p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button onClick={handleNewAttempt} style={btnPrimary}>
                New Attempt
              </button>
              <button onClick={handleLoadPrevious} disabled={attemptsLoading || !hasPreviousAttempts} style={!hasPreviousAttempts ? { ...btnSecondary, opacity: 0.5, cursor: "not-allowed" } : btnSecondary}>
                {attemptsLoading ? "Loading..." : "Load Previous"}
              </button>
            </div>
            <button onClick={() => setShowChoiceDialog(false)} style={btnCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Previous Attempts dialog */}
      {showAttemptsDialog && (
        <div style={overlayStyle}>
          <div style={{ ...dialogStyle, maxWidth: 600 }}>
            <h3>Previous Attempts</h3>
            {attempts.length === 0 ? (
              <p>No unfinished attempts found for this puzzle.</p>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Progress</th>
                    <th style={thStyle}>Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedAttemptId(a.id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: selectedAttemptId === a.id ? "#bbdefb" : "transparent",
                      }}
                    >
                      <td style={tdStyle}>{new Date(a.createdAt).toLocaleString()}</td>
                      <td style={tdStyle}>{Math.round((a.latestProgress ?? 0) * 100)}%</td>
                      <td style={tdStyle}>{formatElapsed(a.latestElapsedSeconds ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1rem" }}>
              <button
                onClick={handleConfirmLoadAttempt}
                disabled={!selectedAttemptId}
                style={selectedAttemptId ? btnPrimary : { ...btnPrimary, opacity: 0.5, cursor: "not-allowed" }}
              >
                Confirm
              </button>
              <button onClick={() => setShowAttemptsDialog(false)} style={btnCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 8,
  padding: "2rem",
  maxWidth: 420,
  width: "90%",
  textAlign: "center",
};

const btnPrimary: React.CSSProperties = {
  padding: "0.5rem 1.5rem",
  fontSize: "1rem",
  backgroundColor: "#1976d2",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "0.5rem 1.5rem",
  fontSize: "1rem",
  backgroundColor: "#fff",
  color: "#1976d2",
  border: "2px solid #1976d2",
  borderRadius: 4,
  cursor: "pointer",
};

const btnCancel: React.CSSProperties = {
  marginTop: "1rem",
  padding: "0.4rem 1rem",
  fontSize: "0.9rem",
  backgroundColor: "transparent",
  color: "#666",
  border: "1px solid #ccc",
  borderRadius: 4,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ccc",
  padding: "0.4rem 0.6rem",
};

const tdStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderBottom: "1px solid #eee",
};
