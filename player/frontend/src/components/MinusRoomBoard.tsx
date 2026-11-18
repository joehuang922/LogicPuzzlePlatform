import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MinusRoomCanon } from "../types/canon";
import { liveErrors, validateMinusRoom } from "./minusRoomRules";

interface MinusRoomBoardProps {
  canon: MinusRoomCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const MR_CELL = 40;
export const MR_PAD = 12;
const S = MR_CELL;
const THIN = 1;
const THICK = 3;
const CIRCLE_R = S * 0.18;
const ERROR = "#d32f2f";
const PLAYER = "#2563eb";

/** Room walls (thick), interior lines (thin gray) and the outer border. */
export function MinusRoomGrid({ canon }: { canon: MinusRoomCanon }) {
  const { rows, cols, edges } = canon;
  const lines: JSX.Element[] = [];
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wall = edges.h[r - 1]?.[c] === 1;
      lines.push(
        <line key={`h-${r}-${c}`} x1={c * S} y1={r * S} x2={(c + 1) * S} y2={r * S}
          stroke={wall ? "#111" : "#bbb"} strokeWidth={wall ? THICK : THIN} strokeLinecap={wall ? "square" : undefined} />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const wall = edges.v[r]?.[c - 1] === 1;
      lines.push(
        <line key={`v-${r}-${c}`} x1={c * S} y1={r * S} x2={c * S} y2={(r + 1) * S}
          stroke={wall ? "#111" : "#bbb"} strokeWidth={wall ? THICK : THIN} strokeLinecap={wall ? "square" : undefined} />
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

/** Circled differences on their edges, over the lines. */
export function MinusRoomCircles({ canon, bad }: { canon: MinusRoomCanon; bad?: Set<number> }) {
  return (
    <g pointerEvents="none">
      {canon.circles.map((circle, i) => {
        const x = (circle.dc / 2 + 0.5) * S;
        const y = (circle.dr / 2 + 0.5) * S;
        const wrong = bad?.has(i);
        return (
          <g key={`k-${i}`}>
            <circle cx={x} cy={y} r={CIRCLE_R} fill="#fff" stroke={wrong ? ERROR : "#111"} strokeWidth={wrong ? 2.5 : 1.3} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={S * 0.26}
              fontFamily="sans-serif" fill={wrong ? ERROR : "#111"}>
              {circle.value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default function MinusRoomBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: MinusRoomBoardProps) {
  const { rows, cols, cells, max } = canon;
  const svgWidth = cols * S + MR_PAD * 2;
  const svgHeight = rows * S + MR_PAD * 2;

  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const [k, v] of Object.entries(initialUserValues ?? {})) {
      const m = /^(\d+),(\d+)$/.exec(k);
      if (m && v >= 1 && v <= max && (cells[Number(m[2])]?.[Number(m[1])] ?? 0) === 0) init[k] = v;
    }
    return init;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const completedRef = useRef(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateMinusRoom(canon, values)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [values, canon, onComplete]);

  const setDigit = useCallback(
    (digit: number) => {
      if (!selected || digit < 1 || digit > max) return;
      setValues((prev) => (prev[selected] === digit ? prev : { ...prev, [selected]: digit }));
    },
    [selected, max]
  );

  const clear = useCallback(() => {
    if (!selected) return;
    setValues((prev) => {
      if (!(selected in prev)) return prev;
      const next = { ...prev };
      delete next[selected];
      return next;
    });
  }, [selected]);

  const onCellClick = (r: number, c: number) => {
    if (readonly || cells[r][c] > 0) return;
    const key = `${c},${r}`;
    setSelected((prev) => (prev === key ? null : key));
    setTimeout(() => hiddenInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (readonly || !selected) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setDigit(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        clear();
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readonly, selected, setDigit, clear]);

  const errors = useMemo(() => (liveValidate ? liveErrors(canon, values) : null), [liveValidate, canon, values]);

  const cellEls: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      const given = cells[r][c];
      const value = given > 0 ? given : values[key];
      const bad = errors?.cells.has(`${r},${c}`);
      cellEls.push(
        <rect key={`bg-${r}-${c}`} x={c * S} y={r * S} width={S} height={S}
          fill={selected === key ? "#e0e8ff" : bad ? "#fde8e8" : "white"}
          style={{ cursor: readonly || given > 0 ? undefined : "pointer" }}
          onClick={() => onCellClick(r, c)} />
      );
      if (value) {
        cellEls.push(
          <text key={`n-${r}-${c}`} x={(c + 0.5) * S} y={(r + 0.5) * S} textAnchor="middle" dominantBaseline="central"
            fontSize={S * 0.5} fontFamily="sans-serif" fontWeight={given > 0 ? "bold" : undefined}
            fill={bad ? ERROR : given > 0 ? "#111" : PLAYER} pointerEvents="none">
            {value}
          </text>
        );
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "#fff" }}>
          <g transform={`translate(${MR_PAD},${MR_PAD})`}>
            {cellEls}
            <MinusRoomGrid canon={canon} />
            <MinusRoomCircles canon={canon} bad={errors?.circles} />
          </g>
        </svg>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#555" }}>1〜{max}</div>
      {!readonly && (
        <input
          ref={hiddenInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
          onInput={(e) => {
            const d = Number(e.currentTarget.value.slice(-1));
            if (d >= 1) setDigit(d);
            e.currentTarget.value = "";
          }}
        />
      )}
    </div>
  );
}
