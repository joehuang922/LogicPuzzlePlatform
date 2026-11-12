import { useState, useMemo, useCallback, useEffect } from "react";
import { SkeletonPuzzleCanon } from "../types/canon";
import { findSlots, formatProblems, isCell, parseWordLines, warnings, wordLines } from "./skeletonPuzzleRules";

interface SkeletonPuzzleEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = 28;
const PAD = 8;

function parseCanon(json: string): SkeletonPuzzleCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed.cells) && parsed.cells.length > 0 && Array.isArray(parsed.cells[0])) {
      return { ...parsed, words: Array.isArray(parsed.words) ? parsed.words : [] } as SkeletonPuzzleCanon;
    }
  } catch {}
  return null;
}

function nextLabel(marks: { label: string }[]): string {
  const taken = new Set(marks.map((m) => m.label));
  for (let i = 0; i < 26; i++) {
    const label = String.fromCharCode(65 + i);
    if (!taken.has(label)) return label;
  }
  return `${marks.length + 1}`;
}

/**
 * Click a lattice square to toggle cell / not a cell; right-click a cell to add or remove
 * a double-frame mark (labels A, B, C, ...). Words go one per line, "word (hint)". Each
 * slot shows its length in a faint corner number. Format problems (slots and words not
 * matching by length, non-kana words, marks off cells) are listed here and rejected by
 * the API; cells in no slot are an overridable warning.
 */
export default function SkeletonPuzzleEditor({ initialJson, onChange }: SkeletonPuzzleEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(12);
  const [newCols, setNewCols] = useState(12);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);
  const [wordText, setWordText] = useState(() => (canon ? wordLines(canon.words) : ""));

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const updateJson = useCallback((next: SkeletonPuzzleCanon) => {
    const { marks, ...rest } = next;
    setJsonText(JSON.stringify(marks && marks.length ? { ...rest, marks } : rest));
  }, []);

  // Keep the word box in step when the JSON textarea changes the list.
  useEffect(() => {
    if (!canon) return;
    if (JSON.stringify(parseWordLines(wordText)) !== JSON.stringify(canon.words)) setWordText(wordLines(canon.words));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canon?.words]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const toggleCell = (r: number, c: number) => {
    if (!canon) return;
    const cells = canon.cells.map((row) => [...row]);
    cells[r][c] = cells[r][c] === 1 ? 0 : 1;
    updateJson({ ...canon, cells });
  };

  const toggleMark = (r: number, c: number) => {
    if (!canon || !isCell(canon.cells, r, c)) return;
    const marks = canon.marks ?? [];
    const has = marks.some((m) => m.r === r && m.c === c);
    updateJson({ ...canon, marks: has ? marks.filter((m) => m.r !== r || m.c !== c) : [...marks, { r, c, label: nextLabel(marks) }] });
  };

  const handleResize = (newR: number, newC: number) => {
    if (!canon || newR < 1 || newC < 1) return;
    const cells = Array.from({ length: newR }, (_, r) =>
      Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : 0))
    );
    updateJson({ ...canon, cells, marks: (canon.marks ?? []).filter((m) => m.r < newR && m.c < newC) });
  };

  const textareaStyle = { width: "100%", minHeight: 160, fontFamily: "monospace", fontSize: "0.85rem", padding: "0.5rem" } as const;

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid Skeleton Puzzle JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && updateJson({ cells: Array.from({ length: newRows }, () => Array(newCols).fill(0)), words: [] })}>
            Create Empty Board
          </button>
        </div>
        <textarea style={textareaStyle} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
      </div>
    );
  }

  const slots = findSlots(canon.cells);
  const problems = formatProblems(canon);
  const notes = warnings(canon);
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={rows} min={1}
            onChange={(e) => handleResize(Number(e.target.value), cols)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={cols} min={1}
            onChange={(e) => handleResize(rows, Number(e.target.value))}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click: cell ↔ not a cell · right-click a cell: double-frame mark · {slots.length} slots, {canon.words.length} words
        </div>
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", margin: "0 0 0.5rem" }}>
          <strong>Format problems (must be fixed to save):</strong>
          <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {notes.length > 0 && (
        <ul style={{ color: "#b77400", fontSize: "0.8rem", margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
          {notes.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <svg
          width={Math.min(svgWidth, 640)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {canon.cells.flatMap((row, r) =>
              row.map((v, c) => (
                <rect
                  key={`s${r},${c}`}
                  x={c * CELL}
                  y={r * CELL}
                  width={CELL}
                  height={CELL}
                  fill={v === 1 ? "white" : "#e4e4e4"}
                  stroke={v === 1 ? "#555" : "#d0d0d0"}
                  strokeWidth={v === 1 ? 1 : 0.5}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleCell(r, c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleMark(r, c);
                  }}
                />
              ))
            )}
            {slots.map((s) => (
              <text key={`len${s.index}`} pointerEvents="none" fontSize={CELL * 0.28} fill="#9ab"
                x={s.c * CELL + (s.dir === "across" ? 2 : CELL - 2)} y={s.r * CELL + (s.dir === "across" ? CELL - 3 : CELL * 0.3)}
                textAnchor={s.dir === "across" ? "start" : "end"}>
                {s.dir === "across" ? `→${s.length}` : `↓${s.length}`}
              </text>
            ))}
            {(canon.marks ?? []).map((m) => (
              <g key={`m${m.r},${m.c}`} pointerEvents="none">
                <rect x={m.c * CELL + 3} y={m.r * CELL + 3} width={CELL - 6} height={CELL - 6} fill="none" stroke="#222" strokeWidth={1} />
                <text x={(m.c + 0.5) * CELL} y={(m.r + 0.5) * CELL} textAnchor="middle" dominantBaseline="central" fontSize={CELL * 0.4}>{m.label}</text>
              </g>
            ))}
          </g>
        </svg>

        <div style={{ flex: "1 1 220px", minWidth: 220 }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Words (one per line, "word (hint)"):</label>
          <textarea
            style={{ ...textareaStyle, minHeight: Math.max(160, Math.min(svgHeight, 520)) }}
            value={wordText}
            onChange={(e) => {
              setWordText(e.target.value);
              updateJson({ ...canon, words: parseWordLines(e.target.value) });
            }}
          />
        </div>
      </div>
    </div>
  );
}
