import { useState, useEffect, useCallback, useRef } from "react";
import { SlalomCanon, SlalomAnswer, SlalomGate } from "../types/canon";

interface SlalomBoardProps {
  canon: SlalomCanon;
  initialAnswer?: SlalomAnswer | null;
  onAnswerChange?: (answer: SlalomAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;

function countGatesCrossed(hTrail: number[][], vTrail: number[][], gates: SlalomGate[]): number {
  let count = 0;
  for (const gate of gates) {
    if (isCrossed(gate, hTrail, vTrail)) count++;
  }
  return count;
}

function isCrossed(gate: SlalomGate, hTrail: number[][], vTrail: number[][]): boolean {
  if (gate.orientation === "v") {
    const col = gate.line;
    for (let r = gate.from; r <= gate.to; r++) {
      if (col > 0 && col <= (hTrail[0]?.length ?? 0) && hTrail[r]?.[col - 1] === 1) return true;
    }
  } else {
    const row = gate.line;
    for (let c = gate.from; c <= gate.to; c++) {
      if (row > 0 && row <= (vTrail?.length ?? 0) && vTrail[row - 1]?.[c] === 1) return true;
    }
  }
  return false;
}

function traceLoop(
  startR: number, startC: number,
  hTrail: number[][], vTrail: number[][],
  rows: number, cols: number
): { r: number; c: number }[] | null {
  const degree: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols - 1; c++)
      if (hTrail[r][c] === 1) { degree[r][c]++; degree[r][c + 1]++; }
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols; c++)
      if (vTrail[r][c] === 1) { degree[r][c]++; degree[r + 1][c]++; }

  if (degree[startR][startC] !== 2) return null;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (degree[r][c] !== 0 && degree[r][c] !== 2) return null;

  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const path: { r: number; c: number }[] = [{ r: startR, c: startC }];
  visited[startR][startC] = true;

  let cr = startR, cc = startC;
  let prevR = -1, prevC = -1;

  while (true) {
    let found = false;
    const neighbors: [number, number][] = [];
    if (cc < cols - 1 && hTrail[cr][cc] === 1) neighbors.push([cr, cc + 1]);
    if (cc > 0 && hTrail[cr][cc - 1] === 1) neighbors.push([cr, cc - 1]);
    if (cr < rows - 1 && vTrail[cr][cc] === 1) neighbors.push([cr + 1, cc]);
    if (cr > 0 && vTrail[cr - 1][cc] === 1) neighbors.push([cr - 1, cc]);

    for (const [nr, nc] of neighbors) {
      if (nr === prevR && nc === prevC) continue;
      if (nr === startR && nc === startC && path.length > 2) {
        return path;
      }
      if (visited[nr][nc]) continue;
      visited[nr][nc] = true;
      path.push({ r: nr, c: nc });
      prevR = cr; prevC = cc;
      cr = nr; cc = nc;
      found = true;
      break;
    }
    if (!found) return null;
  }
}

function getGateCrossingOrder(
  path: { r: number; c: number }[],
  gates: SlalomGate[]
): number[] {
  const order: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const curr = path[i];
    const next = path[(i + 1) % path.length];
    const dr = next.r - curr.r;
    const dc = next.c - curr.c;

    for (let gi = 0; gi < gates.length; gi++) {
      const gate = gates[gi];
      if (gate.orientation === "v" && dc !== 0) {
        const crossCol = dc === 1 ? curr.c + 1 : curr.c;
        if (crossCol === gate.line && curr.r >= gate.from && curr.r <= gate.to) {
          if (!order.includes(gi)) order.push(gi);
        }
      } else if (gate.orientation === "h" && dr !== 0) {
        const crossRow = dr === 1 ? curr.r + 1 : curr.r;
        if (crossRow === gate.line && curr.c >= gate.from && curr.c <= gate.to) {
          if (!order.includes(gi)) order.push(gi);
        }
      }
    }
  }
  return order;
}

function validateSolution(canon: SlalomCanon, hTrail: number[][], vTrail: number[][]): boolean {
  const { cells, start, gates, gateCount } = canon;
  const rows = cells.length;
  const cols = cells[0].length;

  if (cells[start.row][start.col] === 1) return false;

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols - 1; c++)
      if (hTrail[r][c] === 1 && (cells[r][c] === 1 || cells[r][c + 1] === 1)) return false;
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols; c++)
      if (vTrail[r][c] === 1 && (cells[r][c] === 1 || cells[r + 1][c] === 1)) return false;

  const path = traceLoop(start.row, start.col, hTrail, vTrail, rows, cols);
  if (!path) return false;

  const crossingOrder = getGateCrossingOrder(path, gates);
  if (crossingOrder.length !== gateCount) return false;

  function checkOrder(order: number[]): boolean {
    for (let i = 0; i < order.length; i++) {
      const gate = gates[order[i]];
      if (gate.number !== null && gate.number !== i + 1) return false;
    }
    return true;
  }

  if (checkOrder(crossingOrder)) return true;
  const reversed = [...crossingOrder].reverse();
  return checkOrder(reversed);
}

export default function SlalomBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: SlalomBoardProps) {
  const { cells, start, gates, gateCount } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () => Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  const emptyV = () => Array.from({ length: rows - 1 }, () => Array(cols).fill(0));

  const [hTrail, setHTrail] = useState<number[][]>(initialAnswer?.trail?.h ?? emptyH());
  const [vTrail, setVTrail] = useState<number[][]>(initialAnswer?.trail?.v ?? emptyV());
  const completedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => {
    const answer: SlalomAnswer = { trail: { h: hTrail, v: vTrail } };
    onAnswerChange?.(answer);
  }, [hTrail, vTrail, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAny =
      hTrail.some((row) => row.some((v) => v === 1)) ||
      vTrail.some((row) => row.some((v) => v === 1));
    if (!hasAny) return;
    if (validateSolution(canon, hTrail, vTrail)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hTrail, vTrail, canon, onComplete]);

  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number): { r: number; c: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = svgWidth / rect.width;
      const x = (clientX - rect.left) * scaleX - PAD;
      const y = (clientY - rect.top) * scaleX - PAD;
      const c = Math.floor(x / CELL_SIZE);
      const r = Math.floor(y / CELL_SIZE);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
      return { r, c };
    },
    [rows, cols, svgWidth]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      if (cells[cell.r][cell.c] === 1) return;
      draggingRef.current = true;
      eraseModeRef.current = null;
      lastCellRef.current = cell;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [readonly, getCellFromPoint, cells]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      if (cells[cell.r][cell.c] === 1) return;
      const last = lastCellRef.current;
      if (!last) return;
      if (cell.r === last.r && cell.c === last.c) return;

      const dr = cell.r - last.r;
      const dc = cell.c - last.c;
      if (Math.abs(dr) + Math.abs(dc) !== 1) {
        lastCellRef.current = cell;
        return;
      }

      let edgeVal: number;
      if (dc === 1) edgeVal = hTrail[last.r][last.c];
      else if (dc === -1) edgeVal = hTrail[last.r][cell.c];
      else if (dr === 1) edgeVal = vTrail[last.r][last.c];
      else edgeVal = vTrail[cell.r][last.c];

      if (eraseModeRef.current === null) {
        eraseModeRef.current = edgeVal === 1;
      }
      const newVal = eraseModeRef.current ? 0 : 1;

      if (dc === 1) {
        setHTrail((prev) => { const next = prev.map((r) => [...r]); next[last.r][last.c] = newVal; return next; });
      } else if (dc === -1) {
        setHTrail((prev) => { const next = prev.map((r) => [...r]); next[last.r][cell.c] = newVal; return next; });
      } else if (dr === 1) {
        setVTrail((prev) => { const next = prev.map((r) => [...r]); next[last.r][last.c] = newVal; return next; });
      } else {
        setVTrail((prev) => { const next = prev.map((r) => [...r]); next[cell.r][last.c] = newVal; return next; });
      }
      lastCellRef.current = cell;
    },
    [getCellFromPoint, hTrail, vTrail, cells]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    lastCellRef.current = null;
  }, []);

  const crossed = countGatesCrossed(hTrail, vTrail, gates);

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <div style={{ fontSize: "0.82rem", color: "#555", marginBottom: 4 }}>
        Gates crossed: {crossed} / {gateCount}
      </div>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Outer border */}
          <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE} fill="none" stroke="#222" strokeWidth={2} />

          {/* Grid lines */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line key={`gh-${i}`} x1={0} y1={(i + 1) * CELL_SIZE} x2={cols * CELL_SIZE} y2={(i + 1) * CELL_SIZE} stroke="#ddd" strokeWidth={0.5} />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line key={`gv-${i}`} x1={(i + 1) * CELL_SIZE} y1={0} x2={(i + 1) * CELL_SIZE} y2={rows * CELL_SIZE} stroke="#ddd" strokeWidth={0.5} />
          ))}

          {/* Black wall cells */}
          {cells.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <rect key={`wall-${r}-${c}`} x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE} fill="#333" />
              ) : null
            )
          )}

          {/* Gates (dashed lines along grid edges) */}
          {gates.map((gate, gi) => {
            const gateColor = gate.number !== null ? "#c44" : "#666";
            if (gate.orientation === "v") {
              const x = gate.line * CELL_SIZE;
              const y1 = gate.from * CELL_SIZE;
              const y2 = (gate.to + 1) * CELL_SIZE;
              return (
                <line key={`gate-${gi}`} x1={x} y1={y1} x2={x} y2={y2} stroke={gateColor} strokeWidth={2} strokeDasharray="4 3" />
              );
            } else {
              const y = gate.line * CELL_SIZE;
              const x1 = gate.from * CELL_SIZE;
              const x2 = (gate.to + 1) * CELL_SIZE;
              return (
                <line key={`gate-${gi}`} x1={x1} y1={y} x2={x2} y2={y} stroke={gateColor} strokeWidth={2} strokeDasharray="4 3" />
              );
            }
          })}

          {/* Gate numbers */}
          {gates.map((gate, gi) => {
            if (gate.number === null) return null;
            let tx: number, ty: number;
            if (gate.orientation === "v") {
              const midY = ((gate.from + gate.to + 1) / 2) * CELL_SIZE;
              tx = gate.line * CELL_SIZE - CELL_SIZE * 0.5;
              ty = midY;
            } else {
              const midX = ((gate.from + gate.to + 1) / 2) * CELL_SIZE;
              tx = midX;
              ty = gate.line * CELL_SIZE - CELL_SIZE * 0.5;
            }
            return (
              <text
                key={`gn-${gi}`}
                x={tx} y={ty}
                textAnchor="middle" dominantBaseline="central"
                fontSize={CELL_SIZE * 0.35} fontWeight="bold" fill="#c44"
                pointerEvents="none"
              >
                {gate.number}
              </text>
            );
          })}

          {/* Start cell (circled number) */}
          <circle
            cx={(start.col + 0.5) * CELL_SIZE}
            cy={(start.row + 0.5) * CELL_SIZE}
            r={CELL_SIZE * 0.35}
            fill="none" stroke="#222" strokeWidth={2}
          />
          <text
            x={(start.col + 0.5) * CELL_SIZE}
            y={(start.row + 0.5) * CELL_SIZE}
            textAnchor="middle" dominantBaseline="central"
            fontSize={CELL_SIZE * 0.4} fontWeight="bold" fill="#222"
            pointerEvents="none"
          >
            {gateCount}
          </text>

          {/* Trail edges */}
          {hTrail.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`th-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 1.5) * CELL_SIZE} y2={(r + 0.5) * CELL_SIZE}
                  stroke="#2196f3" strokeWidth={3} strokeLinecap="round" pointerEvents="none"
                />
              ) : null
            )
          )}
          {vTrail.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`tv-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 0.5) * CELL_SIZE} y2={(r + 1.5) * CELL_SIZE}
                  stroke="#2196f3" strokeWidth={3} strokeLinecap="round" pointerEvents="none"
                />
              ) : null
            )
          )}
        </g>
      </svg>
    </div>
  );
}
