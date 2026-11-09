import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { SinkaminoCanon } from "../types/canon";
import { ArrowTrail } from "./sinkaminoArrows";
import { BLACK, GIVEN, sinkaminoFormatProblems } from "./sinkaminoRules";

interface SinkaminoEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const SQUARE_INSET = 0.22;

type Mode = "cell" | "arrow";

function parseCanon(json: string): SinkaminoCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed.cells) && parsed.cells.length > 0 && Array.isArray(parsed.cells[0])) {
      return { cells: parsed.cells, arrows: Array.isArray(parsed.arrows) ? parsed.arrows : [] };
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): SinkaminoCanon {
  return { cells: Array.from({ length: rows }, () => Array(cols).fill(0)), arrows: [] };
}

// Trails may pass through layouts the canon can't hold mid-edit (a cell turned black
// under a trail); those are listed, and the server refuses to store them.
export default function SinkaminoEditor({ initialJson, onChange }: SinkaminoEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const [mode, setMode] = useState<Mode>("cell");
  // The trail being dragged in arrow mode, tail first.
  const [draft, setDraft] = useState<number[][] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const updateJson = useCallback((next: SinkaminoCanon) => {
    setJsonText(JSON.stringify(next));
  }, []);

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 1 || newC < 1) return;
      const cells = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : 0))
      );
      const arrows = canon.arrows.filter((t) => t.every(([r, c]) => r < newR && c < newC));
      updateJson({ cells, arrows });
    },
    [canon, rows, cols, updateJson]
  );

  const cellAt = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const x = (e.clientX - rect.left) * scale - PAD;
    const y = (e.clientY - rect.top) * scale - PAD;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);
    return r >= 0 && r < rows && c >= 0 && c < cols ? [r, c] : null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon) return;
    const cell = cellAt(e);
    if (!cell) return;
    const [r, c] = cell;
    if (mode === "cell") {
      const cells = canon.cells.map((row) => [...row]);
      cells[r][c] = (cells[r][c] + 1) % 3; // white -> black -> given square -> white
      updateJson({ ...canon, cells });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft([[r, c]]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const cell = cellAt(e);
    if (!cell) return;
    const [r, c] = cell;
    const [lr, lc] = draft[draft.length - 1];
    if (r === lr && c === lc) return;
    const prev = draft[draft.length - 2];
    if (prev && prev[0] === r && prev[1] === c) {
      setDraft(draft.slice(0, -1)); // dragging back undoes the last step
      return;
    }
    if (Math.abs(r - lr) + Math.abs(c - lc) !== 1) return;
    if (draft.some(([dr, dc]) => dr === r && dc === c)) return;
    setDraft([...draft, [r, c]]);
  };

  const onPointerUp = () => {
    if (!draft || !canon) return;
    if (draft.length >= 2) {
      updateJson({ ...canon, arrows: [...canon.arrows, draft] });
    } else {
      // A click on a trail deletes it.
      const [r, c] = draft[0];
      const i = canon.arrows.findIndex((t) => t.some(([tr, tc]) => tr === r && tc === c));
      if (i >= 0) updateJson({ ...canon, arrows: canon.arrows.filter((_, j) => j !== i) });
    }
    setDraft(null);
  };

  const handleCreateEmpty = () => {
    if (newRows >= 2 && newCols >= 2) updateJson(createEmptyBoard(newRows, newCols));
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid sinkamino JSON. Fix the textarea or create a new board.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={handleCreateEmpty}>Create Empty Board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = sinkaminoFormatProblems(canon);

  const gridLines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    const isBorder = r === 0 || r === rows;
    gridLines.push(
      <line key={`h-${r}`} x1={0} y1={r * CELL_SIZE} x2={cols * CELL_SIZE} y2={r * CELL_SIZE}
        stroke="black" strokeWidth={isBorder ? THICK : THIN} />
    );
  }
  for (let c = 0; c <= cols; c++) {
    const isBorder = c === 0 || c === cols;
    gridLines.push(
      <line key={`v-${c}`} x1={c * CELL_SIZE} y1={0} x2={c * CELL_SIZE} y2={rows * CELL_SIZE}
        stroke="black" strokeWidth={isBorder ? THICK : THIN} />
    );
  }

  const modeButton = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      style={{
        padding: "0.25rem 0.6rem",
        fontSize: "0.85rem",
        border: "1px solid #4a90d9",
        borderRadius: 4,
        background: mode === m ? "#4a90d9" : "white",
        color: mode === m ? "white" : "#4a90d9",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

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
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {modeButton("cell", "Cells")}
          {modeButton("arrow", "Arrows")}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          {mode === "cell"
            ? "Click a cell to cycle white → black → given square"
            : "Drag from tail to head to draw an arrow; click an arrow to delete it"}
        </div>
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", touchAction: "none", display: "block", background: "white", cursor: "pointer" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const v = canon.cells[r][c];
            const inset = CELL_SIZE * SQUARE_INSET;
            return (
              <g key={`cell-${r}-${c}`}>
                <rect x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE}
                  fill={v === BLACK ? "#333" : "white"} />
                {v === GIVEN && (
                  <rect x={c * CELL_SIZE + inset} y={r * CELL_SIZE + inset}
                    width={CELL_SIZE - 2 * inset} height={CELL_SIZE - 2 * inset}
                    fill="white" stroke="#111" strokeWidth={1.5} />
                )}
              </g>
            );
          })}
          {gridLines}
          {canon.arrows.map((trail, i) => (
            <ArrowTrail key={`arrow-${i}`} trail={trail} cellSize={CELL_SIZE} />
          ))}
          {draft && draft.length >= 2 && <ArrowTrail trail={draft} cellSize={CELL_SIZE} color="#4a90d9" />}
          {draft && draft.length === 1 && (
            <circle cx={draft[0][1] * CELL_SIZE + CELL_SIZE / 2} cy={draft[0][0] * CELL_SIZE + CELL_SIZE / 2}
              r={4} fill="#4a90d9" pointerEvents="none" />
          )}
        </g>
      </svg>
      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
        <strong>Arrows:</strong> {canon.arrows.length}
      </div>
    </div>
  );
}
