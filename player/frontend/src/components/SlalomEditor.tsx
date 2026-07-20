import { useState, useRef, useCallback } from "react";
import { SlalomGate } from "../types/canon";

interface SlalomEditorProps {
  initialCanon?: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 32;
const PAD = 16;

export default function SlalomEditor({ initialCanon, onComplete, onCancel }: SlalomEditorProps) {
  let initRows = 9, initCols = 9;
  let initCells: number[][] | null = null;
  let initStart = { row: 0, col: 0 };
  let initGates: SlalomGate[] = [];
  if (initialCanon) {
    try {
      const parsed = JSON.parse(initialCanon);
      if (parsed.cells) {
        initCells = parsed.cells;
        initRows = parsed.cells.length;
        initCols = parsed.cells[0].length;
      }
      if (parsed.start) initStart = parsed.start;
      if (parsed.gates) initGates = parsed.gates;
    } catch { /* ignore */ }
  }

  const [rows, setRows] = useState(initRows);
  const [cols, setCols] = useState(initCols);
  const [cells, setCells] = useState<number[][]>(
    initCells ?? Array.from({ length: initRows }, () => Array(initCols).fill(0))
  );
  const [startCell, setStartCell] = useState(initStart);
  const [gates, setGates] = useState<SlalomGate[]>(initGates);
  const [mode, setMode] = useState<"wall" | "start" | "gate">("wall");
  const [selectedGate, setSelectedGate] = useState<number | null>(null);
  const [jsonText, setJsonText] = useState("");

  const svgRef = useRef<SVGSVGElement>(null);
  const gateDragStart = useRef<{ orientation: "h" | "v"; line: number; pos: number } | null>(null);

  function buildJson() {
    const obj = { cells, start: startCell, gateCount: gates.length, gates };
    return JSON.stringify(obj, null, 2);
  }

  function syncFromJson(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.cells) {
        setCells(parsed.cells);
        setRows(parsed.cells.length);
        setCols(parsed.cells[0].length);
      }
      if (parsed.start) setStartCell(parsed.start);
      if (parsed.gates) setGates(parsed.gates);
    } catch { /* ignore */ }
  }

  function resizeGrid(newRows: number, newCols: number) {
    const newCells = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) => (r < cells.length && c < cells[0].length ? cells[r][c] : 0))
    );
    setRows(newRows);
    setCols(newCols);
    setCells(newCells);
  }

  function handleCellClick(r: number, c: number) {
    if (mode === "wall") {
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 1 ? 0 : 1;
        return next;
      });
    } else if (mode === "start") {
      setStartCell({ row: r, col: c });
    }
  }

  const getGridLineFromPoint = useCallback(
    (clientX: number, clientY: number): { orientation: "h" | "v"; line: number; pos: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = (cols * CELL_SIZE + PAD * 2) / rect.width;
      const x = (clientX - rect.left) * scaleX - PAD;
      const y = (clientY - rect.top) * scaleX - PAD;

      // Snap to cell centers (not edges)
      const col = Math.floor(x / CELL_SIZE);
      const row = Math.floor(y / CELL_SIZE);
      const distV = Math.abs(x - (col + 0.5) * CELL_SIZE);
      const distH = Math.abs(y - (row + 0.5) * CELL_SIZE);

      const threshold = CELL_SIZE * 0.4;

      if (distV < threshold && distV < distH && col >= 0 && col < cols) {
        if (row >= 0 && row < rows) return { orientation: "v", line: col, pos: row };
      }
      if (distH < threshold && row >= 0 && row < rows) {
        if (col >= 0 && col < cols) return { orientation: "h", line: row, pos: col };
      }
      return null;
    },
    [rows, cols]
  );

  const handleGatePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== "gate") return;
      const hit = getGridLineFromPoint(e.clientX, e.clientY);
      if (!hit) return;
      gateDragStart.current = hit;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [mode, getGridLineFromPoint]
  );

  const handleGatePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!gateDragStart.current) return;
      const end = getGridLineFromPoint(e.clientX, e.clientY);
      const start = gateDragStart.current;
      gateDragStart.current = null;
      if (!end) return;
      if (start.orientation !== end.orientation || start.line !== end.line) return;

      const from = Math.min(start.pos, end.pos);
      const to = Math.max(start.pos, end.pos);
      const newGate: SlalomGate = { orientation: start.orientation, line: start.line, from, to, number: null };
      setGates((prev) => [...prev, newGate]);
    },
    [getGridLineFromPoint]
  );

  function handleDeleteGate() {
    if (selectedGate === null) return;
    setGates((prev) => prev.filter((_, i) => i !== selectedGate));
    setSelectedGate(null);
  }

  function handleSetGateNumber(num: string) {
    if (selectedGate === null) return;
    const n = num === "" ? null : Number(num);
    setGates((prev) => prev.map((g, i) => i === selectedGate ? { ...g, number: n } : g));
  }

  function handleDone() {
    onComplete(buildJson());
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>Rows: <input type="number" min={3} max={25} value={rows} onChange={(e) => resizeGrid(Number(e.target.value) || 3, cols)} style={{ width: 50 }} /></label>
        <label>Cols: <input type="number" min={3} max={25} value={cols} onChange={(e) => resizeGrid(rows, Number(e.target.value) || 3)} style={{ width: 50 }} /></label>
        <button onClick={() => setMode("wall")} style={{ fontWeight: mode === "wall" ? "bold" : undefined }}>Wall</button>
        <button onClick={() => setMode("start")} style={{ fontWeight: mode === "start" ? "bold" : undefined }}>Start</button>
        <button onClick={() => setMode("gate")} style={{ fontWeight: mode === "gate" ? "bold" : undefined }}>Gate</button>
      </div>

      {mode === "gate" && (
        <div style={{ fontSize: "0.8rem", color: "#666" }}>
          Drag along a grid line to create a gate.
          {selectedGate !== null && (
            <span>
              {" "}| Gate #{selectedGate + 1}:
              <input
                type="number" min={1} placeholder="order"
                value={gates[selectedGate]?.number ?? ""}
                onChange={(e) => handleSetGateNumber(e.target.value)}
                style={{ width: 50, marginLeft: 4 }}
              />
              <button onClick={handleDeleteGate} style={{ marginLeft: 4 }}>Delete</button>
            </span>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 700)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", touchAction: "none" }}
        onPointerDown={handleGatePointerDown}
        onPointerUp={handleGatePointerUp}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE} fill="none" stroke="#222" strokeWidth={2} />

          {/* Grid */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line key={`gh-${i}`} x1={0} y1={(i + 1) * CELL_SIZE} x2={cols * CELL_SIZE} y2={(i + 1) * CELL_SIZE} stroke="#ddd" strokeWidth={0.5} />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line key={`gv-${i}`} x1={(i + 1) * CELL_SIZE} y1={0} x2={(i + 1) * CELL_SIZE} y2={rows * CELL_SIZE} stroke="#ddd" strokeWidth={0.5} />
          ))}

          {/* Walls */}
          {cells.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? <rect key={`w-${r}-${c}`} x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE} fill="#333" /> : null
            )
          )}

          {/* Gates */}
          {gates.map((gate, gi) => {
            const color = selectedGate === gi ? "#e91e63" : gate.number !== null ? "#c44" : "#666";
            if (gate.orientation === "v") {
              return (
                <line key={`gate-${gi}`}
                  x1={(gate.line + 0.5) * CELL_SIZE} y1={(gate.from + 0.5) * CELL_SIZE}
                  x2={(gate.line + 0.5) * CELL_SIZE} y2={(gate.to + 0.5) * CELL_SIZE}
                  stroke={color} strokeWidth={2.5} strokeDasharray="4 3"
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setSelectedGate(gi); }}
                />
              );
            } else {
              return (
                <line key={`gate-${gi}`}
                  x1={(gate.from + 0.5) * CELL_SIZE} y1={(gate.line + 0.5) * CELL_SIZE}
                  x2={(gate.to + 0.5) * CELL_SIZE} y2={(gate.line + 0.5) * CELL_SIZE}
                  stroke={color} strokeWidth={2.5} strokeDasharray="4 3"
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setSelectedGate(gi); }}
                />
              );
            }
          })}

          {/* Gate numbers */}
          {gates.map((gate, gi) => {
            if (gate.number === null) return null;
            let tx: number, ty: number;
            if (gate.orientation === "v") {
              tx = (gate.line + 0.5) * CELL_SIZE - CELL_SIZE * 0.55;
              ty = ((gate.from + gate.to) / 2 + 0.5) * CELL_SIZE;
            } else {
              tx = ((gate.from + gate.to) / 2 + 0.5) * CELL_SIZE;
              ty = (gate.line + 0.5) * CELL_SIZE - CELL_SIZE * 0.55;
            }
            return (
              <text key={`gn-${gi}`} x={tx} y={ty} textAnchor="middle" dominantBaseline="central"
                fontSize={CELL_SIZE * 0.35} fontWeight="bold" fill="#c44" pointerEvents="none">
                {gate.number}
              </text>
            );
          })}

          {/* Start cell */}
          <circle
            cx={(startCell.col + 0.5) * CELL_SIZE}
            cy={(startCell.row + 0.5) * CELL_SIZE}
            r={CELL_SIZE * 0.3} fill="none" stroke="#1976d2" strokeWidth={2}
          />
          <text
            x={(startCell.col + 0.5) * CELL_SIZE} y={(startCell.row + 0.5) * CELL_SIZE}
            textAnchor="middle" dominantBaseline="central"
            fontSize={CELL_SIZE * 0.35} fontWeight="bold" fill="#1976d2" pointerEvents="none"
          >
            {gates.length}
          </text>

          {/* Cell click targets (only in wall/start mode) */}
          {(mode === "wall" || mode === "start") && cells.flatMap((row, r) =>
            row.map((_, c) => (
              <rect key={`click-${r}-${c}`}
                x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE}
                fill="transparent" style={{ cursor: "pointer" }}
                onClick={() => handleCellClick(r, c)}
              />
            ))
          )}
        </g>
      </svg>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={handleDone} style={{ padding: "0.5rem 1rem" }}>Done</button>
        <button onClick={onCancel} style={{ padding: "0.5rem 1rem" }}>Cancel</button>
        <button onClick={() => setJsonText(buildJson())} style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
          Export JSON
        </button>
        <button onClick={() => syncFromJson(jsonText)} style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
          Import JSON
        </button>
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        rows={8}
        style={{ fontFamily: "monospace", fontSize: "0.75rem", width: "100%", maxWidth: 500 }}
        placeholder="JSON (use Export/Import to sync)"
      />
    </div>
  );
}
