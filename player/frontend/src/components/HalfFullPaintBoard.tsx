import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HalfFullPaintCanon } from "../types/canon";
import { ROOM_SHADE } from "./boardColors";
import {
  BLACK,
  DOT,
  SHADED,
  brokenClues,
  computeRooms,
  fromValues,
  toValues,
  validateHalfFullPaint,
} from "./halfFullPaintRules";

interface HalfFullPaintBoardProps {
  canon: HalfFullPaintCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const HALF_FULL_PAINT_CELL = 36;
export const HALF_FULL_PAINT_PAD = 14;
const CELL = HALF_FULL_PAINT_CELL;
const PAD = HALF_FULL_PAINT_PAD;
const THIN = 1;
const THICK = 3;
const THUMB_BG = "#d9d9d9";
const ERROR = "#d32f2f";
const BAD_ROOM = "#fde0e0";
const DOT_COLOR = "#777";
export const CIRCLE_FILL = ["#fff", "#111", "#9a9a9a"]; // white, black, gray

/** Thin grid lines, thick walls and border; shared with the editor. */
export function HalfFullPaintGrid({ canon }: { canon: HalfFullPaintCanon }) {
  const { width: cols, height: rows, grids } = canon;
  const out: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const thick = r === 0 || r === rows || grids.h[r - 1]?.[c] === 1;
      out.push(
        <line key={`h-${r}-${c}`} x1={c * CELL} y1={r * CELL} x2={(c + 1) * CELL} y2={r * CELL}
          stroke="black" strokeWidth={thick ? THICK : THIN} strokeLinecap="square" />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const thick = c === 0 || c === cols || grids.v[r]?.[c - 1] === 1;
      out.push(
        <line key={`v-${r}-${c}`} x1={c * CELL} y1={r * CELL} x2={c * CELL} y2={(r + 1) * CELL}
          stroke="black" strokeWidth={thick ? THICK : THIN} strokeLinecap="square" />
      );
    }
  }
  return <>{out}</>;
}

/** The circle clues, on top of everything; [bad] holds indices drawn red. */
export function HalfFullPaintCircles({ canon, bad }: { canon: HalfFullPaintCanon; bad?: Set<number> }) {
  return (
    <>
      {canon.circles.map((circle, i) => {
        const isBad = bad?.has(i);
        return (
          <circle
            key={`circle-${circle.dr}-${circle.dc}`}
            cx={(circle.dc / 2) * CELL}
            cy={(circle.dr / 2) * CELL}
            r={CELL * 0.17}
            fill={CIRCLE_FILL[circle.color] ?? "#fff"}
            stroke={isBad ? ERROR : "#111"}
            strokeWidth={isBad ? 3 : circle.color === BLACK ? 1 : 1.5}
            pointerEvents="none"
          />
        );
      })}
    </>
  );
}

export default function HalfFullPaintBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: HalfFullPaintBoardProps) {
  const { width: cols, height: rows } = canon;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const [states, setStates] = useState<number[][]>(() => fromValues(canon, initialUserValues ?? {}));
  const completedRef = useRef(false);

  useEffect(() => {
    onValuesChange?.(toValues(states));
  }, [states, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateHalfFullPaint(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left click cycles forward: unset -> shaded -> dot -> unset. Right click backward.
  const cycle = useCallback(
    (r: number, c: number, dir: 1 | -1) => {
      if (readonly) return;
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = (next[r][c] + dir + 3) % 3;
        return next;
      });
    },
    [readonly]
  );

  const broken = useMemo(() => (liveValidate ? brokenClues(canon, states) : null), [liveValidate, canon, states]);
  const roomIds = useMemo(() => computeRooms(canon).ids, [canon]);

  // Preview: shaded cells black, dotted cells white, unset cells left gray.
  const THUMB_MAX = 160;
  const thumbCell = Math.max(3, Math.min(8, Math.floor(THUMB_MAX / cols), Math.floor(THUMB_MAX / rows)));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {!readonly && (
        <svg
          width={thumbCell * cols}
          height={thumbCell * rows}
          viewBox={`0 0 ${thumbCell * cols} ${thumbCell * rows}`}
          style={{ border: "1px solid #aaa", background: THUMB_BG, display: "block" }}
          shapeRendering="crispEdges"
        >
          {states.flatMap((row, r) =>
            row.map((s, c) =>
              s === SHADED || s === DOT ? (
                <rect key={`tc-${r}-${c}`} x={c * thumbCell} y={r * thumbCell} width={thumbCell} height={thumbCell}
                  fill={s === SHADED ? "#000" : "#fff"} />
              ) : null
            )
          )}
        </svg>
      )}
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ userSelect: "none", display: "block", border: "1px solid #ccc" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            <rect x={0} y={0} width={cols * CELL} height={rows * CELL} fill="white" />
            {states.flatMap((row, r) =>
              row.map((s, c) => {
                const x = c * CELL;
                const y = r * CELL;
                const badRoom = broken?.rooms.has(roomIds[r][c]);
                return (
                  <g key={`cell-${r}-${c}`}>
                    <rect
                      x={x}
                      y={y}
                      width={CELL}
                      height={CELL}
                      fill={s === SHADED ? ROOM_SHADE : badRoom ? BAD_ROOM : "white"}
                      style={{ cursor: readonly ? "default" : "pointer" }}
                      onClick={() => cycle(r, c, 1)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        cycle(r, c, -1);
                      }}
                    />
                    {s === SHADED && badRoom && (
                      <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} fill="none" stroke={ERROR}
                        strokeWidth={2} pointerEvents="none" />
                    )}
                    {s === DOT && (
                      <circle cx={x + CELL / 2} cy={y + CELL / 2} r={3} fill={DOT_COLOR} pointerEvents="none" />
                    )}
                  </g>
                );
              })
            )}
            <HalfFullPaintGrid canon={canon} />
            <HalfFullPaintCircles canon={canon} bad={broken?.circles} />
          </g>
        </svg>
      </div>
    </div>
  );
}

