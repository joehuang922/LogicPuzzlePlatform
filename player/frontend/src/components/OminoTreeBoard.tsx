import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { OminoTreeArrow, OminoTreeCanon } from "../types/canon";
import { liveErrors, validateOminoTree, wallsFromValues } from "./ominoTreeRules";

interface OminoTreeBoardProps {
  canon: OminoTreeCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const OT_CELL = 40;
export const OT_PAD = 12;
const S = OT_CELL;
const THIN = 1;
const THICK = 3.5;
const EDGE_HIT_WIDTH = 12;
const ARROW_FILL = "#9a9a9a";
const ERROR = "#d32f2f";

// A block arrow pointing right, centred on the origin, in cell units.
const ARROW_POINTS = [
  [-0.27, -0.09],
  [0.04, -0.09],
  [0.04, -0.2],
  [0.27, 0],
  [0.04, 0.2],
  [0.04, 0.09],
  [-0.27, 0.09],
]
  .map(([x, y]) => `${x * S},${y * S}`)
  .join(" ");

const ROTATION: Record<OminoTreeArrow["dir"], number> = { right: 0, down: 90, left: 180, up: 270 };

/** Arrows (under) and numbers (over) of a canon; shared with the editor. */
export function OminoTreeClues({
  canon,
  badNumbers,
  badArrows,
}: {
  canon: OminoTreeCanon;
  badNumbers?: Set<string>;
  badArrows?: Set<number>;
}) {
  return (
    <g pointerEvents="none">
      {canon.arrows.map((a, i) => {
        const [dr, dc] = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[a.dir];
        const x = (a.c + 0.5 + dc / 2) * S;
        const y = (a.r + 0.5 + dr / 2) * S;
        const bad = badArrows?.has(i);
        return (
          <polygon
            key={`a-${i}`}
            points={ARROW_POINTS}
            transform={`translate(${x},${y}) rotate(${ROTATION[a.dir]})`}
            fill={bad ? ERROR : ARROW_FILL}
            opacity={bad ? 0.85 : 1}
          />
        );
      })}
      {canon.numbers.flatMap((row, r) =>
        row.map((n, c) => {
          if (!n) return null;
          const bad = badNumbers?.has(`${r},${c}`);
          return (
            <g key={`n-${r}-${c}`}>
              {bad && (
                <circle
                  cx={(c + 0.5) * S}
                  cy={(r + 0.5) * S}
                  r={S * 0.3}
                  fill="none"
                  stroke={ERROR}
                  strokeWidth={2}
                />
              )}
              <text
                x={(c + 0.5) * S}
                y={(r + 0.5) * S}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={n >= 10 ? S * 0.42 : S * 0.55}
                fontFamily="sans-serif"
                fill={bad ? ERROR : "#111"}
              >
                {n}
              </text>
            </g>
          );
        })
      )}
    </g>
  );
}

/** Dashed interior lines, thick walls and the outer border. */
export function OminoTreeGrid({ rows, cols, h, v }: { rows: number; cols: number; h?: number[][]; v?: number[][] }) {
  const lines: JSX.Element[] = [];
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wall = h?.[r - 1]?.[c] === 1;
      lines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * S}
          y1={r * S}
          x2={(c + 1) * S}
          y2={r * S}
          stroke={wall ? "#111" : "#888"}
          strokeWidth={wall ? THICK : THIN}
          strokeDasharray={wall ? undefined : "4,3"}
          strokeLinecap={wall ? "square" : undefined}
        />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const wall = v?.[r]?.[c - 1] === 1;
      lines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * S}
          y1={r * S}
          x2={c * S}
          y2={(r + 1) * S}
          stroke={wall ? "#111" : "#888"}
          strokeWidth={wall ? THICK : THIN}
          strokeDasharray={wall ? undefined : "4,3"}
          strokeLinecap={wall ? "square" : undefined}
        />
      );
    }
  }
  return (
    <g pointerEvents="none">
      {lines}
      <rect x={0} y={0} width={cols * S} height={rows * S} fill="none" stroke="#111" strokeWidth={THICK} />
    </g>
  );
}

export default function OminoTreeBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: OminoTreeBoardProps) {
  const { rows, cols } = canon;
  const svgWidth = cols * S + OT_PAD * 2;
  const svgHeight = rows * S + OT_PAD * 2;

  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const [k, v] of Object.entries(initialUserValues ?? {})) if (v === 1 && /^[hv]:\d+,\d+$/.test(k)) init[k] = 1;
    return init;
  });
  const completedRef = useRef(false);
  const walls = useMemo(() => wallsFromValues(rows, cols, values), [rows, cols, values]);

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateOminoTree(canon, walls)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [walls, canon, onComplete]);

  const toggle = useCallback((key: string) => {
    setValues((prev) => {
      const next = { ...prev };
      if (next[key] === 1) delete next[key];
      else next[key] = 1;
      return next;
    });
  }, []);

  const errors = useMemo(() => (liveValidate ? liveErrors(canon, walls) : null), [liveValidate, canon, walls]);

  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        targets.push(
          <rect
            key={`he-${r}-${c}`}
            x={c * S}
            y={(r + 1) * S - EDGE_HIT_WIDTH / 2}
            width={S}
            height={EDGE_HIT_WIDTH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => toggle(`h:${r},${c}`)}
          />
        );
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        targets.push(
          <rect
            key={`ve-${r}-${c}`}
            x={(c + 1) * S - EDGE_HIT_WIDTH / 2}
            y={r * S}
            width={EDGE_HIT_WIDTH}
            height={S}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => toggle(`v:${r},${c}`)}
          />
        );
      }
    }
  }

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "#fff" }}
      >
        <g transform={`translate(${OT_PAD},${OT_PAD})`}>
          <rect x={0} y={0} width={cols * S} height={rows * S} fill="#fff" />
          <OminoTreeClues canon={canon} badNumbers={errors?.numbers} badArrows={errors?.arrows} />
          <OminoTreeGrid rows={rows} cols={cols} h={walls.h} v={walls.v} />
          {targets}
        </g>
      </svg>
    </div>
  );
}
