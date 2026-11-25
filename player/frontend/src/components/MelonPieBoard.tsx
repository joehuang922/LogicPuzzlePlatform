import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MelonPieCanon } from "../types/canon";
import { CROSS, LINE, Segments, brokenClues, fromValues, toValues, validateMelonPie } from "./melonPieRules";

interface MelonPieBoardProps {
  canon: MelonPieCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const MELON_PIE_CELL = 40;
// Half a cell around the lattice so border circles and points are reachable.
export const MELON_PIE_PAD = 20;
const CELL = MELON_PIE_CELL;
const PAD = MELON_PIE_PAD;
const ERROR = "#d32f2f";
const LINE_COLOR = "#333";
const MARK = "#888";
export const MELON_CIRCLE_FILL = ["#fff", "#111", "#9a9a9a"]; // white, black, gray

/** The dashed lattice, outer boundary included; shared with the editor. */
export function MelonPieLattice({ canon }: { canon: MelonPieCanon }) {
  const { width, height } = canon;
  return (
    <>
      {Array.from({ length: height + 1 }, (_, r) => (
        <line key={`lh-${r}`} x1={0} y1={r * CELL} x2={width * CELL} y2={r * CELL}
          stroke="#777" strokeWidth={1} strokeDasharray="4 3" />
      ))}
      {Array.from({ length: width + 1 }, (_, c) => (
        <line key={`lv-${c}`} x1={c * CELL} y1={0} x2={c * CELL} y2={height * CELL}
          stroke="#777" strokeWidth={1} strokeDasharray="4 3" />
      ))}
    </>
  );
}

/** The circle clues on their points; [bad] holds indices drawn red. */
export function MelonPieCircles({ canon, bad }: { canon: MelonPieCanon; bad?: Set<number> }) {
  return (
    <>
      {canon.circles.map((k, i) => (
        <circle
          key={`circle-${k.r}-${k.c}`}
          cx={k.c * CELL}
          cy={k.r * CELL}
          r={CELL * 0.2}
          fill={MELON_CIRCLE_FILL[k.color] ?? "#fff"}
          stroke={bad?.has(i) ? ERROR : "#111"}
          strokeWidth={bad?.has(i) ? 3 : 1.5}
          pointerEvents="none"
        />
      ))}
    </>
  );
}

type Point = [number, number];

export default function MelonPieBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: MelonPieBoardProps) {
  const { width, height } = canon;
  const svgWidth = width * CELL + PAD * 2;
  const svgHeight = height * CELL + PAD * 2;

  const [seg, setSeg] = useState<Segments>(() => fromValues(canon, initialUserValues ?? {}));
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const eraseRef = useRef<boolean | null>(null);
  const lastRef = useRef<Point | null>(null);
  const downRef = useRef<[number, number] | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    onValuesChange?.(toValues(seg));
  }, [seg, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateMelonPie(canon, seg)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [seg, canon, onComplete]);

  /** The pointer in lattice units (point (r, c) is at (c, r)). */
  const latticeAt = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      return [((clientX - rect.left) * scale - PAD) / CELL, ((clientY - rect.top) * scale - PAD) / CELL];
    },
    [svgWidth]
  );

  const pointAt = (x: number, y: number): Point | null => {
    const r = Math.round(y);
    const c = Math.round(x);
    if (r < 0 || r > height || c < 0 || c > width) return null;
    // Only snap when reasonably close, so a drag doesn't jump diagonally.
    return Math.abs(y - r) <= 0.4 && Math.abs(x - c) <= 0.4 ? [r, c] : null;
  };

  const setSegment = (kind: "h" | "v", r: number, c: number, value: number) =>
    setSeg((prev) => {
      const next = { h: prev.h.map((row) => [...row]), v: prev.v.map((row) => [...row]) };
      next[kind][r][c] = value;
      return next;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (readonly) return;
    const p = latticeAt(e.clientX, e.clientY);
    if (!p) return;
    draggingRef.current = true;
    eraseRef.current = null;
    draggedRef.current = false;
    downRef.current = p;
    lastRef.current = pointAt(p[0], p[1]);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  // Drag through neighbouring points: the first segment crossed decides draw or erase.
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const p = latticeAt(e.clientX, e.clientY);
    if (!p) return;
    const pt = pointAt(p[0], p[1]);
    if (!pt) return;
    const last = lastRef.current;
    if (!last) {
      lastRef.current = pt;
      return;
    }
    if (pt[0] === last[0] && pt[1] === last[1]) return;
    lastRef.current = pt;
    if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) !== 1) return;
    draggedRef.current = true;
    const kind = pt[0] === last[0] ? "h" : "v";
    const r = Math.min(pt[0], last[0]);
    const c = Math.min(pt[1], last[1]);
    const current = seg[kind][r][c];
    if (eraseRef.current === null) eraseRef.current = current === LINE;
    setSegment(kind, r, c, eraseRef.current ? 0 : LINE);
  };

  // A tap without a drag: the nearest segment cycles none -> × -> none (a drawn one is erased).
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const down = downRef.current;
    if (draggedRef.current || !down || readonly) return;
    const [x, y] = down;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    // Distance to the nearest horizontal line vs the nearest vertical line.
    const horizontal = Math.min(fy, 1 - fy) <= Math.min(fx, 1 - fx);
    const r = horizontal ? Math.round(y) : Math.floor(y);
    const c = horizontal ? Math.floor(x) : Math.round(x);
    const kind = horizontal ? "h" : "v";
    const grid = seg[kind];
    if (r < 0 || c < 0 || r >= grid.length || c >= (grid[0]?.length ?? 0)) return;
    setSegment(kind, r, c, grid[r][c] === 0 ? CROSS : 0);
  };

  const broken = useMemo(() => (liveValidate ? brokenClues(canon, seg) : null), [liveValidate, canon, seg]);

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", touchAction: "none", border: "1px solid #ccc", background: "white" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <MelonPieLattice canon={canon} />
          {(["h", "v"] as const).flatMap((kind) =>
            seg[kind].flatMap((row, r) =>
              row.map((x, c) => {
                const x1 = c * CELL;
                const y1 = r * CELL;
                const x2 = kind === "h" ? x1 + CELL : x1;
                const y2 = kind === "h" ? y1 : y1 + CELL;
                if (x === LINE) {
                  return (
                    <line key={`${kind}-${r}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE_COLOR}
                      strokeWidth={4} strokeLinecap="round" pointerEvents="none" />
                  );
                }
                if (x === CROSS) {
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  const d = CELL * 0.1;
                  return (
                    <g key={`${kind}-${r}-${c}`} stroke={MARK} strokeWidth={2} pointerEvents="none">
                      <line x1={mx - d} y1={my - d} x2={mx + d} y2={my + d} />
                      <line x1={mx - d} y1={my + d} x2={mx + d} y2={my - d} />
                    </g>
                  );
                }
                return null;
              })
            )
          )}
          {broken &&
            [...broken.points].map((key) => {
              const [r, c] = key.split(",").map(Number);
              return <circle key={`bad-${key}`} cx={c * CELL} cy={r * CELL} r={CELL * 0.16} fill="none"
                stroke={ERROR} strokeWidth={3} pointerEvents="none" />;
            })}
          <MelonPieCircles canon={canon} bad={broken?.circles} />
        </g>
      </svg>
    </div>
  );
}
