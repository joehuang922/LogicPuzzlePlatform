import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { YajilixCanon, YajilixClue, YajilixDir, YajilixKind } from "../types/canon";
import { YajilixGrid, YAJILIX_CELL, YAJILIX_PAD } from "./YajilixBoard";
import { arrowChar, yajilixFormatProblems, yajilixWarnings } from "./yajilixRules";

interface YajilixEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = YAJILIX_CELL;
const PAD = YAJILIX_PAD;
const KINDS: YajilixKind[] = ["L", "I", "X"];
const DIRS: YajilixDir[] = ["up", "right", "down", "left"];
const KEY_DIRS: Record<string, YajilixDir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

function isClue(v: unknown): v is YajilixClue {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    KINDS.includes(o.kind as YajilixKind) &&
    DIRS.includes(o.dir as YajilixDir) &&
    Number.isInteger(o.num) &&
    (o.num as number) >= 0
  );
}

function parseCanon(json: string): YajilixCanon | null {
  try {
    const cells = JSON.parse(json)?.cells;
    if (!Array.isArray(cells) || cells.length === 0 || !Array.isArray(cells[0]) || cells[0].length === 0) return null;
    if (!cells.every((row: unknown) => Array.isArray(row) && row.every((v) => v === null || isClue(v)))) return null;
    return { cells };
  } catch {
    return null;
  }
}

export function createEmptyYajilix(rows: number, cols: number): YajilixCanon {
  return { cells: Array.from({ length: rows }, () => Array(cols).fill(null)) };
}

/** Resize at the bottom / right, keeping the cells that still fit. */
function resize(canon: YajilixCanon, rows: number, cols: number): YajilixCanon {
  return {
    cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => canon.cells[r]?.[c] ?? null)),
  };
}

export default function YajilixEditor({ initialJson, onChange }: YajilixEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  // Digits typed in a row on the same cell build a multi-digit number.
  const typedRef = useRef<string>("");
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;
  const sel = selected && selected[0] < rows && selected[1] < cols ? selected : null;
  const selClue = sel && canon ? canon.cells[sel[0]][sel[1]] : null;

  const update = useCallback((next: YajilixCanon) => setJsonText(JSON.stringify(next)), []);

  /** Change the selected cell; an empty cell becomes an `L0↑` clue first. */
  const edit = (fn: (clue: YajilixClue) => YajilixClue | null) => {
    if (!canon || !sel) return;
    const cells = canon.cells.map((row) => [...row]);
    const cur = cells[sel[0]][sel[1]] ?? { kind: "L", num: 0, dir: "up" };
    cells[sel[0]][sel[1]] = fn(cur);
    update({ cells });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const c = Math.floor(((e.clientX - rect.left) * scale - PAD) / CELL);
    const r = Math.floor(((e.clientY - rect.top) * scale - PAD) / CELL);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    setSelected([r, c]);
    typedRef.current = "";
    wrapRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!sel) return;
    const key = e.key;
    const upper = key.toUpperCase();
    if (KINDS.includes(upper as YajilixKind)) {
      edit((c) => ({ ...c, kind: upper as YajilixKind }));
      typedRef.current = "";
    } else if (/^[0-9]$/.test(key)) {
      typedRef.current = (typedRef.current + key).slice(-2);
      const num = Number(typedRef.current);
      edit((c) => ({ ...c, num }));
    } else if (KEY_DIRS[key]) {
      edit((c) => ({ ...c, dir: KEY_DIRS[key] }));
      typedRef.current = "";
    } else if (key === "Delete" || key === "Backspace" || key === " ") {
      edit(() => null);
      typedRef.current = "";
    } else {
      return;
    }
    e.preventDefault();
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid yajilix JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && update(createEmptyYajilix(newRows, newCols))}>
            Create Empty Board
          </button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = yajilixFormatProblems(canon);
  const warnings = yajilixWarnings(canon);
  const marked = new Map<string, string>();
  warnings.forEach((p) => marked.set(`${p.r},${p.c}`, "#e69500"));
  problems.forEach((p) => marked.set(`${p.r},${p.c}`, "#c33"));

  const sizeButton = (label: string, title: string, r: number, c: number) => (
    <button
      title={title}
      disabled={r < 2 || c < 2}
      onClick={() => {
        update(resize(canon, r, c));
        setSelected(null);
      }}
      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
    >
      {label}
    </button>
  );

  const toolButton = (label: string, title: string, active: boolean, onClick: () => void) => (
    <button
      key={title}
      title={title}
      disabled={!sel}
      onClick={() => {
        onClick();
        typedRef.current = "";
        wrapRef.current?.focus();
      }}
      style={{
        padding: "0.2rem 0.55rem",
        fontSize: "0.85rem",
        border: "1px solid #4a90d9",
        borderRadius: 4,
        background: active ? "#4a90d9" : "white",
        color: active ? "white" : "#4a90d9",
        cursor: sel ? "pointer" : "default",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff", outline: "none" }}
    >
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
          Rows {rows}
          {sizeButton("+", "Add a row at the bottom", rows + 1, cols)}
          {sizeButton("−", "Remove the bottom row", rows - 1, cols)}
          Cols {cols}
          {sizeButton("+", "Add a column at the right", rows, cols + 1)}
          {sizeButton("−", "Remove the right column", rows, cols - 1)}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a cell, then type L / I / X, its number and an arrow key; Delete clears it
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.85rem", minWidth: 60 }}>{sel ? `R${sel[0] + 1}C${sel[1] + 1}` : "No cell"}</span>
        {KINDS.map((k) => toolButton(k, `Kind ${k}`, selClue?.kind === k, () => edit((c) => ({ ...c, kind: k }))))}
        <span style={{ width: 8 }} />
        {DIRS.map((d) => toolButton(arrowChar(d), `Arrow ${d}`, selClue?.dir === d, () => edit((c) => ({ ...c, dir: d }))))}
        <span style={{ width: 8 }} />
        {toolButton("−", "Number down", false, () => edit((c) => ({ ...c, num: Math.max(0, c.num - 1) })))}
        <span style={{ fontSize: "0.85rem", minWidth: 18, textAlign: "center" }}>{selClue ? selClue.num : ""}</span>
        {toolButton("+", "Number up", false, () => edit((c) => ({ ...c, num: c.num + 1 })))}
        <span style={{ width: 8 }} />
        {toolButton("Clear", "Clear the cell", false, () => edit(() => null))}
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ color: "#a66b00", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Check:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {warnings.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 720)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", touchAction: "none", display: "block", background: "white", cursor: "pointer" }}
        onPointerDown={onPointerDown}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <YajilixGrid canon={canon} />
          {canon.cells.flatMap((row, r) =>
            row.map((clue, c) =>
              clue ? null : (
                <circle key={`d-${r}-${c}`} cx={(c + 0.5) * CELL} cy={(r + 0.5) * CELL} r={2.5} fill="#ccc" pointerEvents="none" />
              )
            )
          )}
          {sel && (
            <rect x={sel[1] * CELL + 1.5} y={sel[0] * CELL + 1.5} width={CELL - 3} height={CELL - 3}
              fill="#fff3c4" fillOpacity={0.5} stroke="#e0b000" strokeWidth={2} pointerEvents="none" />
          )}
          {[...marked].map(([key, color]) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <rect key={`p-${key}`} x={c * CELL + 3} y={r * CELL + 3} width={CELL - 6} height={CELL - 6}
                fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 2" pointerEvents="none" />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
