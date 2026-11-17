import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ZebraRopeCanon } from "../types/canon";
import { brokenClues, validateZebraRope, MARKED, SHADED } from "./zebraRopeRules";

interface ZebraRopeBoardProps {
  canon: ZebraRopeCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 2;
const CIRCLE_R = CELL_SIZE * 0.17;

const BOARD_BG = "#fff";
const SHADE_FILL = "#333";
// Marked unshaded: a light yellow fill instead of a dot, which ropes and circles hide.
export const ZEBRA_MARK_FILL = "#fff3b0";
const ERROR_STROKE = "#d32f2f";
const THUMB_BG = "#d9d9d9";

// Ropes are drawn as printed: a gray band with a thin dark outline.
export const ROPE_OUTLINE = "#444";
export const ROPE_BAND = "#a8a8a8";
export const ROPE_OUTER_W = CELL_SIZE * 0.24;
export const ROPE_INNER_W = CELL_SIZE * 0.16;

// Circle fills by color: 0 = white, 1 = black, 2 = gray.
export const ZEBRA_CIRCLE_FILL = ["#fff", "#111", "#aaa"];

export function ropePoints(rope: [number, number][], cell = CELL_SIZE): string {
  return rope.map(([r, c]) => `${(c + 0.5) * cell},${(r + 0.5) * cell}`).join(" ");
}

/** Ropes and circles of a canon, drawn over the cells (shared with the editor). */
export function ZebraRopeClues({
  canon,
  badRopes,
  badCircles,
  highlight,
}: {
  canon: ZebraRopeCanon;
  badRopes?: Set<number>;
  badCircles?: Set<number>;
  highlight?: [number, number][] | null;
}) {
  return (
    <g pointerEvents="none">
      {canon.ropes.map((rope, i) => (
        <g key={`rope-${i}`}>
          <polyline
            points={ropePoints(rope)}
            fill="none"
            stroke={badRopes?.has(i) ? ERROR_STROKE : ROPE_OUTLINE}
            strokeWidth={ROPE_OUTER_W}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={ropePoints(rope)}
            fill="none"
            stroke={ROPE_BAND}
            strokeWidth={ROPE_INNER_W}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      ))}
      {highlight && highlight.length > 0 && (
        <polyline
          points={ropePoints(highlight)}
          fill="none"
          stroke="#1976d2"
          strokeOpacity={0.7}
          strokeWidth={ROPE_OUTER_W}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {canon.circles.map((circle, i) => {
        const cx = (circle.dc * CELL_SIZE) / 2;
        const cy = (circle.dr * CELL_SIZE) / 2;
        const bad = badCircles?.has(i);
        return (
          <g key={`cir-${circle.dr}-${circle.dc}`}>
            {/* White halo keeps a black circle visible on a shaded cell. */}
            <circle cx={cx} cy={cy} r={CIRCLE_R + 1.5} fill="#fff" />
            <circle
              cx={cx}
              cy={cy}
              r={CIRCLE_R}
              fill={ZEBRA_CIRCLE_FILL[circle.color] ?? "#fff"}
              stroke={bad ? ERROR_STROKE : "#222"}
              strokeWidth={bad ? 2.5 : 1.5}
            />
          </g>
        );
      })}
    </g>
  );
}

export function ZebraRopeGrid({ rows, cols }: { rows: number; cols: number }) {
  const lines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    lines.push(
      <line
        key={`h-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={cols * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke="black"
        strokeWidth={r === 0 || r === rows ? THICK : THIN}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    lines.push(
      <line
        key={`v-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={rows * CELL_SIZE}
        stroke="black"
        strokeWidth={c === 0 || c === cols ? THICK : THIN}
      />
    );
  }
  return <g pointerEvents="none">{lines}</g>;
}

export const ZEBRA_CELL_SIZE = CELL_SIZE;
export const ZEBRA_PAD = PAD;

export default function ZebraRopeBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: ZebraRopeBoardProps) {
  const { width: cols, height: rows } = canon;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const initialStates = useMemo(() => {
    const states = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        const [c, r] = key.split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols && (val === SHADED || val === MARKED)) {
          states[r][c] = val;
        }
      }
    }
    return states;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [states, setStates] = useState<number[][]>(initialStates);
  const completedRef = useRef(false);

  useEffect(() => {
    const values: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (states[r][c] !== 0) values[`${c},${r}`] = states[r][c];
      }
    }
    onValuesChange?.(values);
  }, [states, rows, cols, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateZebraRope(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left click cycles forward: empty -> shaded -> marked -> empty. Right click backward.
  const cycle = useCallback(
    (r: number, c: number, dir: number) => {
      if (readonly) return;
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = (next[r][c] + dir + 3) % 3;
        return next;
      });
    },
    [readonly]
  );

  const broken = useMemo(
    () => (liveValidate ? brokenClues(canon, states) : null),
    [liveValidate, canon, states]
  );

  // Preview: the shaded cells alone, black on gray, so the picture reads at a glance
  // (the same cells the Android solved thumbnail shows).
  const THUMB_MAX = 160;
  const thumbCell = Math.max(
    3,
    Math.min(8, Math.floor(THUMB_MAX / cols), Math.floor(THUMB_MAX / rows))
  );

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
              s === SHADED ? (
                <rect
                  key={`tc-${r}-${c}`}
                  x={c * thumbCell}
                  y={r * thumbCell}
                  width={thumbCell}
                  height={thumbCell}
                  fill="#000"
                />
              ) : null
            )
          )}
        </svg>
      )}
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {states.flatMap((row, r) =>
              row.map((s, c) => (
                <rect
                  key={`fill-${r}-${c}`}
                  x={c * CELL_SIZE}
                  y={r * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={s === SHADED ? SHADE_FILL : s === MARKED ? ZEBRA_MARK_FILL : BOARD_BG}
                />
              ))
            )}

            <ZebraRopeGrid rows={rows} cols={cols} />

            <ZebraRopeClues
              canon={canon}
              badRopes={broken?.ropes}
              badCircles={broken?.circles}
            />

            {!readonly &&
              states.flatMap((row, r) =>
                row.map((_, c) => (
                  <rect
                    key={`click-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => cycle(r, c, 1)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      cycle(r, c, -1);
                    }}
                  />
                ))
              )}
          </g>
        </svg>
      </div>
    </div>
  );
}
