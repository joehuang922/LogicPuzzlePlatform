import { useEffect, useState, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { useParams, useLocation, useSearchParams, Link } from "react-router-dom";
import { getPuzzle, saveSnapshot, listSnapshots, getSnapshotById, SnapshotSummary, AchievementUnlock } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";
import PuzzleBoard from "../components/PuzzleBoard";
import { DIFFICULTY_LABELS } from "../constants";
import { extractAnswer } from "../extractors";
import { computeProgress } from "../progress";
import { useIsMobile } from "../hooks/useIsMobile";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface TimerHandle {
  getElapsed: () => number;
  stop: () => void;
}

const Timer = forwardRef<TimerHandle, { startOffset?: number; resetKey?: number }>(
  function Timer({ startOffset = 0, resetKey }, ref) {
    const [elapsed, setElapsed] = useState(startOffset);
    const startRef = useRef(Date.now() - startOffset * 1000);
    const [stopped, setStopped] = useState(false);

    useEffect(() => {
      startRef.current = Date.now() - startOffset * 1000;
      setElapsed(startOffset);
      setStopped(false);
    }, [startOffset, resetKey]);

    useImperativeHandle(ref, () => ({
      getElapsed: () => Math.floor((Date.now() - startRef.current) / 1000),
      stop: () => setStopped(true),
    }));

    useEffect(() => {
      if (stopped) return;
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }, [resetKey, stopped]);

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
);

export default function Play() {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get("attempt");

  const [puzzle, setPuzzle] = useState<PuzzleDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const navState = location.state as { currentAnswer?: Record<string, unknown>; elapsedSeconds?: number } | null;
  const [currentAnswer, setCurrentAnswer] = useState<Record<string, unknown> | null>(navState?.currentAnswer ?? null);
  const [timerOffset, setTimerOffset] = useState(navState?.elapsedSeconds ?? 0);
  const [boardKey, setBoardKey] = useState(0);

  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [showCongratsDialog, setShowCongratsDialog] = useState(false);
  const [finalTime, setFinalTime] = useState(0);
  const [newAchievements, setNewAchievements] = useState<AchievementUnlock[]>([]);
  const [progress, setProgress] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugJson, setDebugJson] = useState("");

  const timerRef = useRef<TimerHandle>(null);
  const userValuesRef = useRef<Record<string, number>>({});

  const handleValuesChange = useCallback((values: Record<string, number>) => {
    userValuesRef.current = values;
    if (puzzle) {
      setProgress(computeProgress(puzzle, values));
      setDebugJson(JSON.stringify(extractAnswer(puzzle, values), null, 2));
    }
  }, [puzzle]);

  const handleComplete = useCallback(async () => {
    if (!puzzle || !attemptId) return;
    const elapsedSeconds = timerRef.current?.getElapsed() ?? 0;
    timerRef.current?.stop();
    setFinalTime(elapsedSeconds);

    try {
      const answer = extractAnswer(puzzle, userValuesRef.current);
      const currentProgress = computeProgress(puzzle, userValuesRef.current) / 100;
      const result = await saveSnapshot(attemptId, {
        currentAnswer: answer,
        progress: currentProgress,
        elapsedSeconds,
        finished: true,
      });
      if (result.newAchievements?.length) {
        setNewAchievements(result.newAchievements);
      }
    } catch {}

    setShowCongratsDialog(true);
  }, [puzzle, attemptId]);

  useEffect(() => {
    if (!id) return;
    getPuzzle(id)
      .then((res) => setPuzzle(res.puzzle as PuzzleDefinition))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function handleSave() {
    if (!puzzle || !attemptId) return;
    setSaving(true);
    try {
      const answer = extractAnswer(puzzle, userValuesRef.current);
      const elapsedSeconds = timerRef.current?.getElapsed() ?? 0;
      const currentProgress = computeProgress(puzzle, userValuesRef.current) / 100;
      await saveSnapshot(attemptId, {
        currentAnswer: answer,
        progress: currentProgress,
        elapsedSeconds,
      });
      setToast("Progress saved successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setToast(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadClick() {
    if (!attemptId) return;
    setSnapshotsLoading(true);
    try {
      const res = await listSnapshots(attemptId);
      setSnapshots(res.snapshots);
      setSelectedSnapshotId(null);
      setShowLoadDialog(true);
    } finally {
      setSnapshotsLoading(false);
    }
  }

  async function handleConfirmLoad() {
    if (!attemptId || !selectedSnapshotId) return;
    const res = await getSnapshotById(attemptId, selectedSnapshotId);
    const snapshot = res.snapshot;
    const answer = typeof snapshot.currentAnswer === "string"
      ? JSON.parse(snapshot.currentAnswer)
      : snapshot.currentAnswer;
    setCurrentAnswer(answer);
    setTimerOffset(snapshot.elapsedSeconds);
    setBoardKey((k) => k + 1);
    setShowLoadDialog(false);
  }

  if (loading) return <p>Loading puzzle...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!puzzle) return <p>Puzzle not found.</p>;

  const difficultyStars = Array.from({ length: 5 }, (_, i) => i < puzzle.difficulty ? "★" : "☆").join("");

  return (
    <div>
      <Link to="/" style={{ display: "inline-block", marginBottom: "0.75rem", color: "#666", textDecoration: "none", fontSize: "0.85rem" }}>&larr; Back to puzzles</Link>

      {/* Info card */}
      <div style={infoCardStyle}>
        {/* Left content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Puzzle type badge */}
          <div style={puzzleTypeBadgeStyle}>
            {puzzle.puzzleTypeName.toUpperCase()}
          </div>

          {/* Title */}
          <div style={{ margin: "0.5rem 0 0.6rem", fontSize: isMobile ? "1.1rem" : "1.25rem", fontWeight: 500, color: "#333" }}>
            {puzzle.title ?? "Untitled"}
          </div>

          {/* Metadata chips row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
            <span style={chipStyle}>
              <span style={{ color: "#f5a623", letterSpacing: 1 }}>{difficultyStars}</span>
              {" "}{DIFFICULTY_LABELS[puzzle.difficulty] || `${puzzle.difficulty}/5`}
            </span>
            {puzzle.author && (
              <span style={chipStyle}>
                <span style={{ opacity: 0.6 }}>by</span> {puzzle.author}
              </span>
            )}
            {puzzle.width && puzzle.height && (
              <span style={chipStyle}>
                {puzzle.width}&times;{puzzle.height}
              </span>
            )}
          </div>

          {/* Collection name */}
          {puzzle.srcCollectionName && (
            <div style={{ fontSize: "0.82rem", color: "#666", marginTop: "0.25rem" }}>
              {puzzle.srcCollectionName}
            </div>
          )}
        </div>

        {/* Right side: cover image */}
        {puzzle.srcCollectionCoverSrc && (
          <div style={coverImageStyle}>
            <img
              src={puzzle.srcCollectionCoverSrc}
              alt={`${puzzle.srcCollectionName} cover`}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }}
            />
          </div>
        )}
      </div>

      {/* Timer and action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <Timer ref={timerRef} startOffset={timerOffset} resetKey={boardKey} />
        {attemptId && (
          <>
            <button onClick={handleSave} disabled={saving} style={btnStyle}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={handleLoadClick} disabled={snapshotsLoading} style={btnStyle}>
              {snapshotsLoading ? "Loading..." : "Load"}
            </button>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <div style={{ flex: 1, height: 8, backgroundColor: "#e0e0e0", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(progress, 100)}%`, height: "100%", backgroundColor: progress >= 100 ? "#4caf50" : "#1976d2", borderRadius: 4, transition: "width 0.3s ease" }} />
        </div>
        <span style={{ fontSize: "0.85rem", fontFamily: "monospace", minWidth: "3.5rem", textAlign: "right" }}>
          {progress.toFixed(1)} %
        </span>
      </div>
      {toast && (
        <div style={toastStyle}>
          {toast}
        </div>
      )}
      <PuzzleBoard key={boardKey} puzzle={puzzle} initialAnswer={currentAnswer} onValuesChange={handleValuesChange} onComplete={handleComplete} />

      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={() => setDebugOpen((o) => !o)}
          style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem", background: "#f0f0f0", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
        >
          {debugOpen ? "Hide" : "Show"} Answer JSON
        </button>
        {debugOpen && (
          <textarea
            readOnly
            value={debugJson}
            style={{ display: "block", marginTop: "0.5rem", width: "100%", maxWidth: 600, height: 200, fontFamily: "monospace", fontSize: "0.75rem", resize: "vertical" }}
          />
        )}
      </div>

      {showCongratsDialog && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <h3>Congratulations!</h3>
            <p>You solved the puzzle in <strong>{formatElapsed(finalTime)}</strong>!</p>
            {newAchievements.length > 0 && (
              <div style={{ marginTop: "1rem", textAlign: "left" }}>
                <p style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>Achievements Unlocked!</p>
                {newAchievements.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem", marginBottom: "0.5rem", backgroundColor: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 6 }}>
                    <span style={{ fontSize: "1.5rem" }}>{a.icon}</span>
                    <div>
                      <strong>{a.name}</strong>
                      <div style={{ fontSize: "0.85rem", color: "#555" }}>{a.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1rem" }}>
              <Link to="/" style={{ ...btnPrimary, textDecoration: "none", display: "inline-block" }}>
                Back to Puzzles
              </Link>
              <button onClick={() => setShowCongratsDialog(false)} style={btnCancel}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadDialog && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <h3>Load Snapshot</h3>
            {snapshots.length === 0 ? (
              <p>No snapshots found for this attempt.</p>
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
                  {snapshots.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSnapshotId(s.id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: selectedSnapshotId === s.id ? "#bbdefb" : "transparent",
                      }}
                    >
                      <td style={tdStyle}>{new Date(s.createdAt).toLocaleString()}</td>
                      <td style={tdStyle}>{((s.progress ?? 0) * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>{formatElapsed(s.elapsedSeconds ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1rem" }}>
              <button
                onClick={handleConfirmLoad}
                disabled={!selectedSnapshotId}
                style={selectedSnapshotId ? btnPrimary : { ...btnPrimary, opacity: 0.5, cursor: "not-allowed" }}
              >
                Confirm Load
              </button>
              <button onClick={() => setShowLoadDialog(false)} style={btnCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const infoCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "1rem",
  padding: "1rem 1.25rem",
  marginBottom: "0.75rem",
  background: "#fafbfc",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
};

const puzzleTypeBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.3rem 0.9rem",
  fontSize: "0.95rem",
  fontWeight: 700,
  letterSpacing: 2,
  color: "#fff",
  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  borderRadius: 6,
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.2rem 0.55rem",
  fontSize: "0.8rem",
  backgroundColor: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  color: "#374151",
};

const coverImageStyle: React.CSSProperties = {
  width: 80,
  height: 100,
  borderRadius: 6,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
  flexShrink: 0,
  backgroundColor: "#f3f4f6",
};

const btnStyle: React.CSSProperties = {
  padding: "0.35rem 1rem",
  fontSize: "0.9rem",
  backgroundColor: "#1976d2",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const toastStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  marginBottom: "0.75rem",
  backgroundColor: "#e8f5e9",
  color: "#2e7d32",
  border: "1px solid #a5d6a7",
  borderRadius: 4,
  fontSize: "0.9rem",
};

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
  maxWidth: 550,
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

const btnCancel: React.CSSProperties = {
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
