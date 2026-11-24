import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IrregularNonogramCanon, IrregularNonogramClue } from "../types/canon";
import { IN_CELL, IN_PAD, IrregularNonogramDrawing, Bounds } from "./IrregularNonogramBoard";
import {
  irregularNonogramFormatProblems,
  irregularNonogramWarnings,
  layoutBounds,
  segmentAt,
  segmentCells,
} from "./irregularNonogramRules";

interface IrregularNonogramEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

type Mode = "shape" | "clues";
type RowClue = IrregularNonogramClue & { row: number };
type ColClue = IrregularNonogramClue & { col: number };

function parseCanon(json: string): IrregularNonogramCanon | null {
  try {
    const p = JSON.parse(json);
    if (!Number.isInteger(p?.width) || !Number.isInteger(p?.height) || !Array.isArray(p.cells)) return null;
    if (!Array.isArray(p.rowClues) || !Array.isArray(p.colClues)) return null;
    return { width: p.width, height: p.height, cells: p.cells, rowClues: p.rowClues, colClues: p.colClues };
  } catch {
    return null;
  }
}

/** An empty rectangular board with no clues. */
export function createEmptyIrregularNonogram(rows: number, cols: number): IrregularNonogramCanon {
  return { width: cols, height: rows, cells: Array.from({ length: rows }, () => Array(cols).fill(1)), rowClues: [], colClues: [] };
}

/**
 * Set lattice cell (r, c) in or out of the board, growing the bounding box when it lies
 * outside and trimming empty outer rows/columns (clue coordinates shift along). A clue
 * whose first cell is still on the board follows its piece's new start; one whose first
 * cell left the board stays as it was (the problems list flags it) — the edit is never
 * refused or "fixed".
 */
export function setBoardCell(canon: IrregularNonogramCanon, r: number, c: number, on: boolean): IrregularNonogramCanon {
  const top = Math.max(0, -r);
  const left = Math.max(0, -c);
  const height = Math.max(canon.height + top, r + top + 1);
  const width = Math.max(canon.width + left, c + left + 1);
  const cells = Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => canon.cells[i - top]?.[j - left] ?? 0));
  cells[r + top][c + left] = on ? 1 : 0;
  let next: IrregularNonogramCanon = {
    width,
    height,
    cells,
    rowClues: canon.rowClues.map((e) => ({ ...e, row: e.row + top, start: e.start + left })),
    colClues: canon.colClues.map((e) => ({ ...e, col: e.col + left, start: e.start + top })),
  };
  // Trim empty outer rows and columns.
  const rowsUsed = next.cells.map((row) => row.includes(1));
  const colsUsed = Array.from({ length: width }, (_, j) => next.cells.some((row) => row[j] === 1));
  const r0 = rowsUsed.indexOf(true);
  const c0 = colsUsed.indexOf(true);
  if (r0 >= 0 && c0 >= 0) {
    const r1 = rowsUsed.lastIndexOf(true);
    const c1 = colsUsed.lastIndexOf(true);
    next = {
      width: c1 - c0 + 1,
      height: r1 - r0 + 1,
      cells: next.cells.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1)),
      rowClues: next.rowClues.map((e) => ({ ...e, row: e.row - r0, start: e.start - c0 })),
      colClues: next.colClues.map((e) => ({ ...e, col: e.col - c0, start: e.start - r0 })),
    };
  }
  // Clues follow their pieces.
  const taken = new Set<string>();
  const follow = <T extends RowClue | ColClue>(e: T, axis: "row" | "col"): T => {
    const line = axis === "row" ? (e as RowClue).row : (e as ColClue).col;
    const seg = axis === "row" ? segmentAt(next, "row", line, e.start) : segmentAt(next, "col", e.start, line);
    const key = `${axis}:${line}:${seg?.start ?? e.start}`;
    if (!seg || taken.has(key)) return e;
    taken.add(key);
    return { ...e, start: seg.start };
  };
  next.rowClues = next.rowClues.map((e) => follow(e, "row"));
  next.colClues = next.colClues.map((e) => follow(e, "col"));
  return next;
}

/** Set (or clear, with an empty list) the clue of the piece through (r, c) along an axis. */
export function setPieceClue(
  canon: IrregularNonogramCanon,
  axis: "row" | "col",
  r: number,
  c: number,
  clues: number[],
  side: "start" | "end"
): IrregularNonogramCanon {
  const seg = segmentAt(canon, axis, r, c);
  if (!seg) return canon;
  if (axis === "row") {
    const rest = canon.rowClues.filter((e) => !(e.row === seg.line && e.start === seg.start));
    const rowClues = clues.length ? [...rest, { row: seg.line, start: seg.start, side, clues }] : rest;
    rowClues.sort((a, b) => a.row - b.row || a.start - b.start);
    return { ...canon, rowClues };
  }
  const rest = canon.colClues.filter((e) => !(e.col === seg.line && e.start === seg.start));
  const colClues = clues.length ? [...rest, { col: seg.line, start: seg.start, side, clues }] : rest;
  colClues.sort((a, b) => a.col - b.col || a.start - b.start);
  return { ...canon, colClues };
}

const parseClues = (text: string): number[] | null => {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  const nums = parts.map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= 1) ? nums : null;
};

export default function IrregularNonogramEditor({ initialJson, onChange }: IrregularNonogramEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [mode, setMode] = useState<Mode>("clues");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [newRows, setNewRows] = useState(15);
  const [newCols, setNewCols] = useState(15);
  const [rowText, setRowText] = useState("");
  const [colText, setColText] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const paintRef = useRef<boolean | null>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const update = useCallback((next: IrregularNonogramCanon) => setJsonText(JSON.stringify(next)), []);

  const baseBounds = canon ? layoutBounds(canon) : ([0, 0, 0, 0] as Bounds);
  // Shape mode leaves a ring of lattice cells around the drawing to grow into.
  const bounds: Bounds = mode === "shape" ? [baseBounds[0] - 1, baseBounds[1] - 1, baseBounds[2] + 1, baseBounds[3] + 1] : baseBounds;
  const svgWidth = (bounds[3] - bounds[1] + 1) * IN_CELL + IN_PAD * 2;
  const svgHeight = (bounds[2] - bounds[0] + 1) * IN_CELL + IN_PAD * 2;

  const rowEntry = canon && selected ? (() => {
    const seg = segmentAt(canon, "row", selected[0], selected[1]);
    return seg ? canon.rowClues.find((e) => e.row === seg.line && e.start === seg.start) ?? null : null;
  })() : null;
  const colEntry = canon && selected ? (() => {
    const seg = segmentAt(canon, "col", selected[0], selected[1]);
    return seg ? canon.colClues.find((e) => e.col === seg.line && e.start === seg.start) ?? null : null;
  })() : null;

  useEffect(() => {
    setRowText(rowEntry ? rowEntry.clues.join(" ") : "");
    setColText(colEntry ? colEntry.clues.join(" ") : "");
    // Re-read only when the selection moves to another piece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.[0], selected?.[1], rowEntry?.start, colEntry?.start]);

  const cellAt = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const c = Math.floor(((e.clientX - rect.left) * scale - IN_PAD) / IN_CELL) + bounds[1];
    const r = Math.floor(((e.clientY - rect.top) * scale - IN_PAD) / IN_CELL) + bounds[0];
    if (r < bounds[0] || r > bounds[2] || c < bounds[1] || c > bounds[3]) return null;
    return [r, c];
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid irregular nonogram JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={1} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={1} />
          <button onClick={() => newRows >= 1 && newCols >= 1 && update(createEmptyIrregularNonogram(newRows, newCols))}>Create Empty Board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const isBoard = (r: number, c: number) => canon.cells[r]?.[c] === 1;

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const cell = cellAt(e);
    if (!cell) return;
    if (mode === "clues") {
      if (isBoard(cell[0], cell[1])) setSelected(cell);
      return;
    }
    const on = !isBoard(cell[0], cell[1]);
    paintRef.current = on;
    setSelected(null);
    update(setBoardCell(canon, cell[0], cell[1], on));
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (paintRef.current === null || mode !== "shape") return;
    const cell = cellAt(e);
    if (!cell || isBoard(cell[0], cell[1]) === paintRef.current) return;
    update(setBoardCell(canon, cell[0], cell[1], paintRef.current));
  };

  const problems = irregularNonogramFormatProblems(canon);
  const warnings = irregularNonogramWarnings(canon);
  const marks = new Map<string, string>();
  warnings.forEach((w) => w.cells.forEach(([r, c]) => marks.set(`${r},${c}`, "#e69500")));
  problems.forEach((p) => p.cells.forEach(([r, c]) => marks.set(`${r},${c}`, "#c33")));

  const selectedCells = new Set<string>();
  if (selected && mode === "clues") {
    for (const axis of ["row", "col"] as const) {
      const seg = segmentAt(canon, axis, selected[0], selected[1]);
      if (seg) segmentCells(seg).forEach(([r, c]) => selectedCells.add(`${r},${c}`));
    }
  }

  const applyClue = (axis: "row" | "col", text: string, side: "start" | "end") => {
    if (!selected) return;
    const clues = parseClues(text);
    if (clues === null) return;
    update(setPieceClue(canon, axis, selected[0], selected[1], clues, side));
  };

  const sideToggle = (axis: "row" | "col", entry: { side: "start" | "end" } | null, text: string) => {
    const side = entry?.side ?? "start";
    const labels = axis === "row" ? ["Left", "Right"] : ["Top", "Bottom"];
    return (
      <span style={{ display: "inline-flex", gap: 2 }}>
        {(["start", "end"] as const).map((s, i) => (
          <button
            key={s}
            onClick={() => applyClue(axis, text, s)}
            disabled={!entry}
            style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", background: side === s && entry ? "#4a90d9" : "white", color: side === s && entry ? "white" : "#333", border: "1px solid #4a90d9", borderRadius: 3 }}
          >
            {labels[i]}
          </button>
        ))}
      </span>
    );
  };

  const modeButton = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", border: "1px solid #4a90d9", borderRadius: 4, background: mode === m ? "#4a90d9" : "white", color: mode === m ? "white" : "#4a90d9", cursor: "pointer" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {modeButton("clues", "Clues")}
          {modeButton("shape", "Shape")}
        </div>
        <span style={{ fontSize: "0.8rem" }}>
          {canon.height} × {canon.width}
        </span>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          {mode === "shape"
            ? "Click or drag cells to add them to the board or take them out"
            : "Click a board cell, then type its row and column clues (space separated; empty removes)"}
        </div>
      </div>

      {mode === "clues" && selected && (
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
          <span>R{selected[0] + 1}C{selected[1] + 1}</span>
          <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
            Row clue
            <input
              value={rowText}
              onChange={(e) => {
                setRowText(e.target.value);
                applyClue("row", e.target.value, rowEntry?.side ?? "start");
              }}
              style={{ width: 110 }}
            />
            {sideToggle("row", rowEntry, rowText)}
          </label>
          <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
            Column clue
            <input
              value={colText}
              onChange={(e) => {
                setColText(e.target.value);
                applyClue("col", e.target.value, colEntry?.side ?? "start");
              }}
              style={{ width: 110 }}
            />
            {sideToggle("col", colEntry, colText)}
          </label>
        </div>
      )}

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p, i) => <li key={i}>{p.message}</li>)}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ color: "#a66b00", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Check:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </div>
      )}

      <div style={{ overflow: "auto", maxHeight: "75vh" }}>
        <svg
          ref={svgRef}
          width={svgWidth}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", touchAction: "none", display: "block", background: "white", cursor: "pointer" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (paintRef.current = null)}
          onPointerCancel={() => (paintRef.current = null)}
        >
          <g transform={`translate(${IN_PAD},${IN_PAD})`}>
            <IrregularNonogramDrawing canon={canon} bounds={bounds} marks={marks} selected={selectedCells} showLattice={mode === "shape"} />
          </g>
        </svg>
      </div>
    </div>
  );
}
