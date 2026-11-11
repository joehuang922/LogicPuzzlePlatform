import { useState, useEffect, useCallback, useRef } from "react";
import { HashiCanon, HashiAnswer } from "../types/canon";
import {
  Bridges, Point, bridgeCount, emptyBridges, isIsland, islandState, neighbour, validateHashi,
  withBridge, wouldCross,
} from "./hashiRules";

interface HashiBoardProps {
  canon: HashiCanon;
  initialAnswer?: HashiAnswer | null;
  onAnswerChange?: (answer: HashiAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

const PITCH = 40;
const PAD = 24;
const RADIUS = PITCH * 0.42;
const BRIDGE_GAP = 3.5;
const INK = "#222";
const DONE_FILL = "#d0d0d0";
const ERROR_COLOR = "#d33";
const ERROR_FILL = "#f8d0d0";

/**
 * Hashi (type 34). Islands sit on lattice points; there are no grid lines. Press on an
 * island and drag along its row or column: reaching the nearest island that way cycles
 * the bridge between them 0 -> 1 -> 2 -> 0 and ends the drag. A new bridge that would
 * cross another does nothing. Islands turn grey when their number is met and, with
 * live validation on, red when over it.
 */
export default function HashiBoard({ canon, initialAnswer, onAnswerChange, onComplete, readonly, liveValidate }: HashiBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = (cols - 1) * PITCH + PAD * 2;
  const svgHeight = (rows - 1) * PITCH + PAD * 2;

  const [bridges, setBridges] = useState<Bridges>(() => {
    const saved = initialAnswer?.bridges;
    if (saved && saved.h?.length === rows && saved.v?.length === rows - 1) return saved;
    return emptyBridges(rows, cols);
  });
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const startRef = useRef<Point | null>(null);

  useEffect(() => {
    onAnswerChange?.({ bridges });
  }, [bridges, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateHashi(cells, bridges)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [bridges, cells, onComplete]);

  /** Board coordinates (lattice units) of a pointer event. */
  const toLattice = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      return {
        x: ((clientX - rect.left) * scale - PAD) / PITCH,
        y: ((clientY - rect.top) * scale - PAD) / PITCH,
      };
    },
    [svgWidth]
  );

  /** The island under the pointer (within its circle), or null. */
  const islandAt = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const p = toLattice(clientX, clientY);
      if (!p) return null;
      const r = Math.round(p.y);
      const c = Math.round(p.x);
      if (r < 0 || r >= rows || c < 0 || c >= cols || !isIsland(cells[r][c])) return null;
      if (Math.hypot(p.x - c, p.y - r) * PITCH > RADIUS * 1.15) return null;
      return { r, c };
    },
    [toLattice, rows, cols, cells]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;
      const island = islandAt(e.clientX, e.clientY);
      if (!island) return;
      startRef.current = island;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [readonly, islandAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const target = islandAt(e.clientX, e.clientY);
      if (!target || (target.r === start.r && target.c === start.c)) return;
      if (target.r !== start.r && target.c !== start.c) return;
      const dr = Math.sign(target.r - start.r);
      const dc = Math.sign(target.c - start.c);
      const next = neighbour(cells, start, dr, dc);
      if (!next || next.r !== target.r || next.c !== target.c) return;
      startRef.current = null;
      setBridges((prev) => {
        const count = bridgeCount(prev, start, target);
        if (count === 0 && wouldCross(prev, start, target)) return prev;
        return withBridge(prev, start, target, (count + 1) % 3);
      });
    },
    [islandAt, cells]
  );

  const handlePointerUp = useCallback(() => {
    startRef.current = null;
  }, []);

  const x = (c: number) => c * PITCH;
  const y = (r: number) => r * PITCH;

  // One entry per bridge: walk right and down from each island to its neighbour.
  const bridgeLines: { a: Point; b: Point; n: number }[] = [];
  cells.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!isIsland(v)) return;
      for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
        const b = neighbour(cells, { r, c }, dr, dc);
        if (!b) continue;
        const n = bridgeCount(bridges, { r, c }, b);
        if (n > 0) bridgeLines.push({ a: { r, c }, b, n });
      }
    })
  );

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", touchAction: "none", background: "white" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {bridgeLines.flatMap(({ a, b, n }) => {
            const horizontal = a.r === b.r;
            const offsets = n === 1 ? [0] : [-BRIDGE_GAP, BRIDGE_GAP];
            return offsets.map((o) => (
              <line
                key={`b-${a.r}-${a.c}-${b.r}-${b.c}-${o}`}
                x1={x(a.c) + (horizontal ? 0 : o)}
                y1={y(a.r) + (horizontal ? o : 0)}
                x2={x(b.c) + (horizontal ? 0 : o)}
                y2={y(b.r) + (horizontal ? o : 0)}
                stroke={INK}
                strokeWidth={2}
                pointerEvents="none"
              />
            ));
          })}

          {cells.flatMap((row, r) =>
            row.map((v, c) => {
              if (!isIsland(v)) return null;
              const state = islandState(cells, bridges, r, c);
              const error = liveValidate && state === "over";
              return (
                <g key={`i-${r}-${c}`}>
                  <circle
                    cx={x(c)}
                    cy={y(r)}
                    r={RADIUS}
                    fill={error ? ERROR_FILL : state === "done" ? DONE_FILL : "white"}
                    stroke={error ? ERROR_COLOR : INK}
                    strokeWidth={1.8}
                  />
                  <text
                    x={x(c)}
                    y={y(r)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={PITCH * 0.5}
                    fill={error ? ERROR_COLOR : "black"}
                    pointerEvents="none"
                  >
                    {v}
                  </text>
                </g>
              );
            })
          )}
        </g>
      </svg>
    </div>
  );
}
