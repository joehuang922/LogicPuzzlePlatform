import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { WhimsicalKnightCanon } from "../types/canon";
import {
  Dot,
  Segment,
  allClues,
  badSegments,
  clueBroken,
  isStep,
  parseSegmentKey,
  segmentKey,
  segmentsOf,
  validateWhimsicalKnight,
} from "./whimsicalKnightRules";

interface WhimsicalKnightBoardProps {
  canon: WhimsicalKnightCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const WK_SPACING = 48;
export const WK_PAD = 24;
const S = WK_SPACING;
const DOT_R = S * 0.07;
const CIRCLE_R = S * 0.22;
const SQUARE_HALF = S * 0.22;
// A dragged pointer joins a dot within this fraction of the spacing; a knight-move drag
// passes 0.45 from the dots it skips, so it can't catch them.
const CAPTURE = 0.3;
// A tap this close (fraction of spacing) to a segment erases it.
const TAP_HIT = 0.2;

const GRAY_FILL = "#8c8c8c";
const LINE = "#222";
const ERROR = "#d32f2f";

/** Gray squares and white clues of a canon (shared with the editor). */
export function WhimsicalKnightClues({
  canon,
  brokenClues,
}: {
  canon: WhimsicalKnightCanon;
  brokenClues?: Set<number>;
}) {
  const inset = S * 0.1;
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id="wk-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={GRAY_FILL} />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#6f6f6f" strokeWidth="1.5" />
        </pattern>
      </defs>
      {canon.gray.flatMap((row, r) =>
        row.map((g, c) =>
          g === 1 ? (
            <rect
              key={`g-${r}-${c}`}
              x={c * S + inset}
              y={r * S + inset}
              width={S - 2 * inset}
              height={S - 2 * inset}
              fill="url(#wk-hatch)"
            />
          ) : null
        )
      )}
      {allClues(canon).map(([kind, p], i) => {
        const x = (p.dc * S) / 2;
        const y = (p.dr * S) / 2;
        const stroke = brokenClues?.has(i) ? ERROR : "#111";
        const width = brokenClues?.has(i) ? 2.5 : 1.5;
        return kind === "circle" ? (
          <circle key={`k-${i}`} cx={x} cy={y} r={CIRCLE_R} fill="#fff" stroke={stroke} strokeWidth={width} />
        ) : (
          <rect
            key={`k-${i}`}
            x={x - SQUARE_HALF}
            y={y - SQUARE_HALF}
            width={2 * SQUARE_HALF}
            height={2 * SQUARE_HALF}
            fill="#fff"
            stroke={stroke}
            strokeWidth={width}
          />
        );
      })}
    </g>
  );
}

export function WhimsicalKnightDots({ rows, cols }: { rows: number; cols: number }) {
  return (
    <g pointerEvents="none">
      {Array.from({ length: rows * cols }, (_, i) => (
        <circle key={`d-${i}`} cx={(i % cols) * S} cy={Math.floor(i / cols) * S} r={DOT_R} fill="#111" />
      ))}
    </g>
  );
}

function distToSegment(px: number, py: number, [a, b]: Segment): number {
  // Dots are [row, col]; points are (x = col, y = row), all in spacing units.
  const ax = a[1], ay = a[0], bx = b[1], by = b[0];
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export default function WhimsicalKnightBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: WhimsicalKnightBoardProps) {
  const { rows, cols } = canon;
  const svgWidth = (cols - 1) * S + WK_PAD * 2;
  const svgHeight = (rows - 1) * S + WK_PAD * 2;

  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const [k, v] of Object.entries(initialUserValues ?? {})) {
      const seg = parseSegmentKey(k);
      if (v === 1 && seg && isStep(seg[0], seg[1])) init[k] = 1;
    }
    return init;
  });
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastDotRef = useRef<Dot | null>(null);
  const drawModeRef = useRef<boolean | null>(null);
  const draggedRef = useRef(false);

  const segs = useMemo(() => segmentsOf(values), [values]);

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateWhimsicalKnight(canon, segs)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [segs, canon, onComplete]);

  // Pointer position in spacing units (x = column, y = row), first dot at 0.
  const pointAt = useCallback(
    (e: React.PointerEvent): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      return {
        x: ((e.clientX - rect.left) * scale - WK_PAD) / S,
        y: ((e.clientY - rect.top) * scale - WK_PAD) / S,
      };
    },
    [svgWidth]
  );

  const dotNear = (p: { x: number; y: number }): Dot | null => {
    const r = Math.round(p.y);
    const c = Math.round(p.x);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return Math.hypot(p.x - c, p.y - r) <= CAPTURE ? [r, c] : null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readonly || e.button !== 0) return;
    const p = pointAt(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastDotRef.current = dotNear(p);
    drawModeRef.current = null;
    draggedRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readonly || !(e.buttons & 1)) return;
    const p = pointAt(e);
    const dot = p && dotNear(p);
    if (!dot) return;
    const last = lastDotRef.current;
    if (last && last[0] === dot[0] && last[1] === dot[1]) return;
    lastDotRef.current = dot;
    if (!last || !isStep(last, dot)) return;
    draggedRef.current = true;
    const key = segmentKey(last, dot);
    if (drawModeRef.current === null) drawModeRef.current = values[key] !== 1;
    const draw = drawModeRef.current;
    setValues((prev) => {
      if ((prev[key] === 1) === draw) return prev;
      const next = { ...prev };
      if (draw) next[key] = 1;
      else delete next[key];
      return next;
    });
  };

  // A tap (no segment dragged) on a segment erases it.
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readonly || draggedRef.current) return;
    const p = pointAt(e);
    if (!p) return;
    let best = -1;
    let bestD = TAP_HIT;
    segs.forEach((s, i) => {
      const d = distToSegment(p.x, p.y, s);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return;
    const [a, b] = segs[best];
    const key = segmentKey(a, b);
    setValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const bad = useMemo(() => (liveValidate ? badSegments(canon, segs) : new Set<number>()), [liveValidate, canon, segs]);
  const brokenClues = useMemo(() => {
    const out = new Set<number>();
    if (liveValidate) allClues(canon).forEach(([kind, p], i) => clueBroken(kind, p, segs) && out.add(i));
    return out;
  }, [liveValidate, canon, segs]);

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", touchAction: "none", background: "#fff" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${WK_PAD},${WK_PAD})`}>
          <WhimsicalKnightClues canon={canon} brokenClues={brokenClues} />
          <g pointerEvents="none">
            {segs.map(([a, b], i) => (
              <line
                key={`s-${a[0]}-${a[1]}-${b[0]}-${b[1]}`}
                x1={a[1] * S}
                y1={a[0] * S}
                x2={b[1] * S}
                y2={b[0] * S}
                stroke={bad.has(i) ? ERROR : LINE}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ))}
          </g>
          <WhimsicalKnightDots rows={rows} cols={cols} />
        </g>
      </svg>
    </div>
  );
}
