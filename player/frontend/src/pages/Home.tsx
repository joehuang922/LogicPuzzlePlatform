import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sortPuzzleTypes, listPuzzles, listCollections, listPuzzleTypes, listAttempts, getSolvedQuestions, getCollectionProgress, createAttempt, sortCollections, getAttemptSnapshot, Collection, CollectionProgress, Attempt, PuzzleType, Puzzle } from "../api/client";
import { PuzzleDefinition } from "../types/puzzle";
import { DIFFICULTY_LABELS } from "../constants";
import { extractAnswer } from "../extractors";
import { groupByCollection, groupByType, sizeTag, SizeTag } from "../utils/puzzleBrowse";

const HARDCODED_PLAYER_ID = 1;

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type SortKey = "title" | "difficulty" | "author" | "size";
type SortDir = "asc" | "desc";

function comparePuzzles(a: Puzzle, b: Puzzle, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  switch (key) {
    case "title":
      cmp = (a.title || "").localeCompare(b.title || "");
      break;
    case "difficulty":
      cmp = a.difficulty - b.difficulty;
      break;
    case "author":
      cmp = (a.author || "").localeCompare(b.author || "");
      break;
    case "size":
      cmp = ((a.width ?? 0) * (a.height ?? 0)) - ((b.width ?? 0) * (b.height ?? 0));
      break;
  }
  return dir === "asc" ? cmp : -cmp;
}

function SortableHeader({ label, sortKey, currentKey, currentDir, onSort, style }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  style?: React.CSSProperties;
}) {
  const indicator = currentKey === sortKey ? (currentDir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      style={{ padding: "0.3rem", cursor: "pointer", userSelect: "none", ...style }}
      onClick={() => onSort(sortKey)}
    >
      {label}{indicator}
    </th>
  );
}

function ProgressBar({ solved, total, style }: { solved: number; total: number; style?: React.CSSProperties }) {
  const pct = total === 0 ? 0 : Math.round((solved / total) * 100);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", ...style }}>
      <span style={{ display: "inline-block", width: 60, height: 8, background: "#e0e0e0", borderRadius: 4, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: pct === 100 ? "#4caf50" : "#1976d2", borderRadius: 4 }} />
      </span>
      <span style={{ fontSize: "0.75rem", color: "#555" }}>{pct}%</span>
    </span>
  );
}

const SIZE_PILL_COLORS: Record<SizeTag, string> = { BIG: "#ef6c00", GIANT: "#c62828" };

/** BIG / GIANT pill for an oversized puzzle; nothing for a normal one. */
function SizePill({ puzzle }: { puzzle: Parameters<typeof sizeTag>[0] }) {
  const tag = sizeTag(puzzle);
  if (!tag) return null;
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: "0.4rem",
        padding: "0 0.45rem",
        borderRadius: 999,
        background: SIZE_PILL_COLORS[tag],
        color: "white",
        fontSize: "0.65rem",
        fontWeight: "bold",
        lineHeight: "1.4",
        verticalAlign: "middle",
      }}
    >
      {tag}
    </span>
  );
}

type BrowseMode = "collection" | "type";
const BROWSE_MODE_KEY = "home.browseMode";

function readBrowseMode(): BrowseMode {
  try {
    return localStorage.getItem(BROWSE_MODE_KEY) === "type" ? "type" : "collection";
  } catch {
    return "collection";
  }
}

function writeBrowseMode(mode: BrowseMode) {
  try {
    localStorage.setItem(BROWSE_MODE_KEY, mode);
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}

/** Puzzle rows with sortable headers; [items] arrive in their default order. */
function PuzzleTable({
  items,
  solvedIds,
  attemptedIds,
  onPuzzleClick,
  sortKey,
  sortDir,
  onSort,
}: {
  items: Puzzle[];
  solvedIds: Set<string>;
  attemptedIds: Set<string>;
  onPuzzleClick: (puzzle: Puzzle) => void;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const rows = sortKey ? [...items].sort((a, b) => comparePuzzles(a, b, sortKey, sortDir)) : items;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
          <SortableHeader label="Title" sortKey="title" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Difficulty" sortKey="difficulty" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Author" sortKey="author" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Size" sortKey="size" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <th style={{ padding: "0.3rem", width: 30, textAlign: "center" }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr
            key={p.id}
            onClick={() => onPuzzleClick(p)}
            style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
          >
            <td style={{ padding: "0.3rem" }}>{p.title || "(none)"}<SizePill puzzle={p} /></td>
            <td style={{ padding: "0.3rem" }}>{DIFFICULTY_LABELS[p.difficulty] || String(p.difficulty)}</td>
            <td style={{ padding: "0.3rem" }}>{p.author || "N/A"}</td>
            <td style={{ padding: "0.3rem" }}>{p.width && p.height ? `${p.width} x ${p.height}` : "—"}</td>
            <td style={{ padding: "0.3rem", textAlign: "center" }}>
              {solvedIds.has(p.id) ? <span style={{ color: "green" }}>✓</span> : attemptedIds.has(p.id) ? <span style={{ color: "#f59e0b" }}>◐</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useSort() {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }
  return { sortKey, sortDir, onSort };
}

const groupHeaderStyle: React.CSSProperties = {
  fontWeight: "bold",
  fontSize: "0.85rem",
  padding: "0.3rem 0.5rem",
  background: "#e8e8e8",
  borderRadius: 4,
  marginBottom: "0.25rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

/** An expanded type's puzzles, grouped by collection (type-first view). */
function TypePuzzleList({
  puzzles,
  solvedIds,
  attemptedIds,
  onPuzzleClick,
}: {
  puzzles: Puzzle[];
  solvedIds: Set<string>;
  attemptedIds: Set<string>;
  onPuzzleClick: (puzzle: Puzzle) => void;
}) {
  const sort = useSort();
  return (
    <div>
      {groupByCollection(puzzles).map((g) => {
        const solved = g.puzzles.filter((p) => solvedIds.has(p.id)).length;
        return (
          <div key={g.collectionName} style={{ marginBottom: "0.75rem" }}>
            <div style={groupHeaderStyle}>
              <span>{g.collectionName} ({g.puzzles.length})</span>
              <ProgressBar solved={solved} total={g.puzzles.length} />
            </div>
            <PuzzleTable items={g.puzzles} solvedIds={solvedIds} attemptedIds={attemptedIds} onPuzzleClick={onPuzzleClick} {...sort} />
          </div>
        );
      })}
    </div>
  );
}

// Puzzles with no collection are listed under this default collection. Id 0
// is understood by the API as "no collection" (puzzle list, progress, manifest).
const DEFAULT_COLLECTION_ID = 0;

/** Collections in display order, with the default collection last. */
function withDefaultCollection(collections: Collection[], uncollectedCount: number): Collection[] {
  const sorted = sortCollections(collections);
  if (uncollectedCount > 0) {
    sorted.push({
      id: DEFAULT_COLLECTION_ID,
      name: "Uncategorized",
      publisher: null,
      publishAt: null,
      coverSrc: null,
      puzzleCount: uncollectedCount,
    });
  }
  return sorted;
}

function CollectionPuzzleList({
  puzzles,
  puzzleTypes,
  solvedIds,
  attemptedIds,
  onPuzzleClick,
}: {
  puzzles: Puzzle[];
  puzzleTypes: PuzzleType[];
  solvedIds: Set<string>;
  attemptedIds: Set<string>;
  onPuzzleClick: (puzzle: Puzzle) => void;
}) {
  const puzzleTypeMap = Object.fromEntries(puzzleTypes.map((pt) => [pt.id, pt.jpLabel]));
  const groupedByType = groupByType(puzzles);

  const sort = useSort();

  return (
    <div>
      {groupedByType.map(({ typeId, puzzles: items }) => {
        const typeSolved = items.filter((p) => solvedIds.has(p.id)).length;
        return (
          <div key={typeId} style={{ marginBottom: "0.75rem" }}>
            <div style={groupHeaderStyle}>
              <span>{puzzleTypeMap[Number(typeId)] || `Type ${typeId}`} ({items.length})</span>
              <ProgressBar solved={typeSolved} total={items.length} />
            </div>
            <PuzzleTable items={items} solvedIds={solvedIds} attemptedIds={attemptedIds} onPuzzleClick={onPuzzleClick} {...sort} />
          </div>
        );
      })}
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
  const [solvedPuzzleIds, setSolvedPuzzleIds] = useState<Set<string>>(new Set());
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(new Set());
  const [collectionProgressMap, setCollectionProgressMap] = useState<Map<number, CollectionProgress>>(new Map());

  const [browseMode, setBrowseModeState] = useState<BrowseMode>(readBrowseMode);
  const [expandedTypeId, setExpandedTypeId] = useState<number | null>(null);
  const [typePuzzles, setTypePuzzles] = useState<Puzzle[]>([]);
  const [loadingTypePuzzles, setLoadingTypePuzzles] = useState(false);
  const [typeLoadError, setTypeLoadError] = useState<string | null>(null);
  // Only the latest type click may write the list (a slow earlier one is dropped).
  const typeLoadSeq = useRef(0);
  const [typeSolvedIds, setTypeSolvedIds] = useState<Set<string>>(new Set());
  const [typeAttemptedIds, setTypeAttemptedIds] = useState<Set<string>>(new Set());

  function setBrowseMode(mode: BrowseMode) {
    setBrowseModeState(mode);
    writeBrowseMode(mode);
  }

  useEffect(() => {
    Promise.all([listPuzzles({ played: "recent", limit: 10 }), listCollections(), listPuzzleTypes()])
      .then(([puzzleRes, collectionRes, ptRes]) => {
        setPuzzles(puzzleRes.puzzles as PuzzleDefinition[]);
        const sortedCollections = withDefaultCollection(collectionRes.collections, collectionRes.uncollectedCount ?? 0);
        setCollections(sortedCollections);
        setPuzzleTypes(ptRes.puzzleTypes);
        if (sortedCollections.length > 0) {
          const ids = sortedCollections.map((c) => c.id);
          getCollectionProgress(HARDCODED_PLAYER_ID, ids).then((res) => {
            setCollectionProgressMap(new Map(res.collectionProgress.map((p) => [p.collectionId, p])));
          });
        }
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
      const ids = res.puzzles.map((p) => p.id);
      const solvedRes = await getSolvedQuestions(HARDCODED_PLAYER_ID, ids);
      setSolvedPuzzleIds(new Set(solvedRes.solvedQuestions));
      setAttemptedPuzzleIds(new Set(solvedRes.attemptedQuestions ?? []));
      setCollectionProgressMap((prev) => {
        const next = new Map(prev);
        next.set(collectionId, { collectionId, total: res.puzzles.length, solved: solvedRes.solvedQuestions.length });
        return next;
      });
    } finally {
      setLoadingCollectionPuzzles(false);
    }
  }

  // Type-first view: one type open at a time.
  async function handleExpandType(typeId: number) {
    if (expandedTypeId === typeId) {
      setExpandedTypeId(null);
      return;
    }
    const seq = ++typeLoadSeq.current;
    setExpandedTypeId(typeId);
    setLoadingTypePuzzles(true);
    setTypeLoadError(null);
    setTypePuzzles([]);
    try {
      const res = await listPuzzles({ puzzleType: String(typeId) });
      const ids = res.puzzles.map((p) => p.id);
      const solvedRes = await getSolvedQuestions(HARDCODED_PLAYER_ID, ids);
      if (seq !== typeLoadSeq.current) return;
      setTypePuzzles(res.puzzles);
      setTypeSolvedIds(new Set(solvedRes.solvedQuestions));
      setTypeAttemptedIds(new Set(solvedRes.attemptedQuestions ?? []));
    } catch (e) {
      if (seq !== typeLoadSeq.current) return;
      setTypeLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === typeLoadSeq.current) setLoadingTypePuzzles(false);
    }
  }

  async function handleCollectionPuzzleClick(puzzle: Puzzle) {
    setSelectedPuzzle(puzzle as unknown as PuzzleDefinition);
    setShowChoiceDialog(true);
    setHasPreviousAttempts(false);
    const res = await listAttempts(HARDCODED_PLAYER_ID, puzzle.id);
    setHasPreviousAttempts(res.attempts.length > 0);
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

  // Collections include the default one for uncollected puzzles, so this is empty
  // only when there are no puzzles at all.
  if (collections.length === 0) {
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

  // Types that have puzzles, in type order with incubating types last (puzzleCount
  // absent: list it anyway).
  const browseTypes = sortPuzzleTypes(puzzleTypes.filter((t) => (t.puzzleCount ?? 1) > 0));

  return (
    <div>
      {puzzles.length > 0 && <h2>Recently Played</h2>}
      <ul>
        {puzzles.map((p) => (
          <li key={p.id}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); handlePuzzleClick(p); }}
              style={{ cursor: "pointer" }}
            >
              {p.title ?? "Untitled"}<SizePill puzzle={p} /> — {p.puzzleTypeJpLabel} ({DIFFICULTY_LABELS[p.difficulty] || `${p.difficulty}/5`})
              {p.srcCollectionName && ` — from: ${p.srcCollectionName}`}
            </a>
          </li>
        ))}
      </ul>

      {(collections.length > 0 || browseTypes.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <h2>{browseMode === "collection" ? "Collections" : "Types"}</h2>
          <div role="group" aria-label="Browse by" style={{ display: "inline-flex", border: "1px solid #1976d2", borderRadius: 4, overflow: "hidden" }}>
            {(["collection", "type"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBrowseMode(mode)}
                aria-pressed={browseMode === mode}
                style={{
                  padding: "0.3rem 0.9rem",
                  fontSize: "0.85rem",
                  border: "none",
                  cursor: "pointer",
                  background: browseMode === mode ? "#1976d2" : "white",
                  color: browseMode === mode ? "white" : "#1976d2",
                }}
              >
                {mode === "collection" ? "Collection" : "Type"}
              </button>
            ))}
          </div>
        </div>
      )}

      {browseMode === "type" && browseTypes.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Type</th>
              <th style={{ textAlign: "right", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Puzzles</th>
              <th style={{ textAlign: "right", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {browseTypes.map((t) => {
              const loaded = expandedTypeId === t.id && !loadingTypePuzzles && !typeLoadError;
              return (
                <Fragment key={t.id}>
                  <tr
                    onClick={() => handleExpandType(t.id)}
                    style={{ cursor: "pointer", borderBottom: "1px solid #eee", background: expandedTypeId === t.id ? "#f0f7ff" : undefined }}
                  >
                    <td style={{ padding: "0.5rem" }}>{t.jpLabel}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem" }}>{loaded ? typePuzzles.length : t.puzzleCount ?? "—"}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem" }}>
                      {loaded
                        ? <ProgressBar solved={typePuzzles.filter((p) => typeSolvedIds.has(p.id)).length} total={typePuzzles.length} />
                        : "—"}
                    </td>
                  </tr>
                  {expandedTypeId === t.id && (
                    <tr>
                      <td colSpan={3} style={{ padding: "0.75rem 0.5rem", background: "#fafafa" }}>
                        {loadingTypePuzzles ? (
                          <p style={{ margin: 0, fontSize: "0.85rem" }}>Loading questions...</p>
                        ) : typeLoadError ? (
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#c62828" }}>Couldn't load questions: {typeLoadError}</p>
                        ) : typePuzzles.length === 0 ? (
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>No questions of this type.</p>
                        ) : (
                          <TypePuzzleList
                            puzzles={typePuzzles}
                            solvedIds={typeSolvedIds}
                            attemptedIds={typeAttemptedIds}
                            onPuzzleClick={handleCollectionPuzzleClick}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {browseMode === "collection" && collections.length > 0 && (
        <>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Name</th>
                <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Publisher</th>
                <th style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Publish Date</th>
                <th style={{ textAlign: "right", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Puzzles</th>
                <th style={{ textAlign: "right", borderBottom: "2px solid #ddd", padding: "0.5rem" }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
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
                    <td style={{ textAlign: "right", padding: "0.5rem" }}>
                      {collectionProgressMap.has(c.id)
                        ? <ProgressBar solved={collectionProgressMap.get(c.id)!.solved} total={collectionProgressMap.get(c.id)!.total} />
                        : "—"}
                    </td>
                  </tr>
                  {expandedCollectionId === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={5} style={{ padding: "0.75rem 0.5rem", background: "#fafafa" }}>
                        {loadingCollectionPuzzles ? (
                          <p style={{ margin: 0, fontSize: "0.85rem" }}>Loading questions...</p>
                        ) : collectionPuzzles.length === 0 ? (
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>No questions in this collection.</p>
                        ) : (
                          <CollectionPuzzleList
                            puzzles={collectionPuzzles}
                            puzzleTypes={puzzleTypes}
                            solvedIds={solvedPuzzleIds}
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
