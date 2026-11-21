import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CountryRoadCanon } from "../types/canon";
import {
  CROSS,
  DOT,
  Loop,
  brokenClues,
  computeRooms,
  dims,
  fromValues,
  toValues,
  validateCountryRoad,
  wallBelow,
  wallRight,
} from "./countryRoadRules";

interface CountryRoadBoardProps {
  canon: CountryRoadCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const COUNTRY_ROAD_CELL = 36;
export const COUNTRY_ROAD_PAD = 12;
const CELL = COUNTRY_ROAD_CELL;
const PAD = COUNTRY_ROAD_PAD;
const THIN = 1;
const THICK = 3;
const ERROR = "#d32f2f";
const MARK = "#888";

/** Grid lines (thick walls) and room numbers; shared with the editor. */
export function CountryRoadGrid({
  canon,
  badNumbers,
  badRooms,
}: {
  canon: CountryRoadCanon;
  badNumbers?: Set<string>;
  badRooms?: Set<number>;
}) {
  const { rows, cols } = dims(canon);
  const rooms = useMemo(() => (badRooms && badRooms.size > 0 ? computeRooms(canon).ids : null), [canon, badRooms]);
  const out: JSX.Element[] = [];
  if (rooms) {
    rooms.forEach((row, r) =>
      row.forEach((id, c) => {
        if (badRooms!.has(id)) {
          out.push(<rect key={`br-${r}-${c}`} x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill="#fde0e0" />);
        }
      })
    );
  }
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const thick = r === 0 || r === rows || wallBelow(canon, r - 1, c);
      out.push(
        <line key={`h-${r}-${c}`} x1={c * CELL} y1={r * CELL} x2={(c + 1) * CELL} y2={r * CELL}
          stroke="black" strokeWidth={thick ? THICK : THIN} strokeLinecap="square" />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const thick = c === 0 || c === cols || wallRight(canon, r, c - 1);
      out.push(
        <line key={`v-${r}-${c}`} x1={c * CELL} y1={r * CELL} x2={c * CELL} y2={(r + 1) * CELL}
          stroke="black" strokeWidth={thick ? THICK : THIN} strokeLinecap="square" />
      );
    }
  }
  canon.cells.forEach((row, r) =>
    row.forEach((n, c) => {
      if (n <= 0) return;
      const bad = badNumbers?.has(`${r},${c}`);
      out.push(
        <text key={`n-${r}-${c}`} x={c * CELL + 4} y={r * CELL + 3} dominantBaseline="hanging"
          fontSize={CELL * 0.42} fontFamily="sans-serif" fill={bad ? ERROR : "black"}
          fontWeight={bad ? "bold" : "normal"} pointerEvents="none">
          {n}
        </text>
      );
    })
  );
  return <>{out}</>;
}

export default function CountryRoadBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: CountryRoadBoardProps) {
  const { rows, cols } = dims(canon);
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const initial = useMemo(
    () => fromValues(rows, cols, initialUserValues ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [loop, setLoop] = useState<Loop>(initial.loop);
  const [marks, setMarks] = useState<number[][]>(initial.marks);
  const completedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const eraseRef = useRef<boolean | null>(null);
  const lastRef = useRef<{ r: number; c: number } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    onValuesChange?.(toValues(loop, marks));
  }, [loop, marks, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateCountryRoad(canon, loop)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [loop, canon, onComplete]);

  const cellAt = useCallback(
    (clientX: number, clientY: number): { r: number; c: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      const c = Math.floor(((clientX - rect.left) * scale - PAD) / CELL);
      const r = Math.floor(((clientY - rect.top) * scale - PAD) / CELL);
      return r >= 0 && r < rows && c >= 0 && c < cols ? { r, c } : null;
    },
    [rows, cols, svgWidth]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (readonly) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    draggingRef.current = true;
    eraseRef.current = null;
    lastRef.current = cell;
    draggedRef.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  // Drag through neighbouring cells: the first edge crossed decides draw or erase.
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const cell = cellAt(e.clientX, e.clientY);
    const last = lastRef.current;
    if (!cell || !last || (cell.r === last.r && cell.c === last.c)) return;
    const dr = cell.r - last.r;
    const dc = cell.c - last.c;
    lastRef.current = cell;
    if (Math.abs(dr) + Math.abs(dc) !== 1) return;
    draggedRef.current = true;
    const horizontal = dr === 0;
    const r = horizontal ? last.r : Math.min(last.r, cell.r);
    const c = horizontal ? Math.min(last.c, cell.c) : last.c;
    const current = horizontal ? loop.h[r][c] : loop.v[r][c];
    if (eraseRef.current === null) eraseRef.current = current === 1;
    const value = eraseRef.current ? 0 : 1;
    setLoop((prev) => {
      const next = { h: prev.h.map((row) => [...row]), v: prev.v.map((row) => [...row]) };
      (horizontal ? next.h : next.v)[r][c] = value;
      return next;
    });
  };

  // A tap without a drag cycles the cell's mark: none -> × -> • -> none (right click back).
  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const cell = lastRef.current;
    lastRef.current = null;
    if (draggedRef.current || !cell || readonly) return;
    const back = e.button === 2;
    setMarks((prev) => {
      const next = prev.map((row) => [...row]);
      next[cell.r][cell.c] = (next[cell.r][cell.c] + (back ? 2 : 1)) % 3;
      return next;
    });
  };

  const broken = useMemo(
    () => (liveValidate ? brokenClues(canon, loop, marks) : null),
    [liveValidate, canon, loop, marks]
  );

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", touchAction: "none", border: "1px solid #ccc" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <rect x={0} y={0} width={cols * CELL} height={rows * CELL} fill="white" />
          <CountryRoadGrid canon={canon} badNumbers={broken?.numbers} badRooms={broken?.rooms} />

          {marks.flatMap((row, r) =>
            row.map((m, c) => {
              const cx = (c + 0.5) * CELL;
              const cy = (r + 0.5) * CELL;
              if (m === CROSS) {
                const d = CELL * 0.16;
                const color = broken?.crosses.has(`${r},${c}`) ? ERROR : MARK;
                return (
                  <g key={`m-${r}-${c}`} stroke={color} strokeWidth={2} pointerEvents="none">
                    <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
                    <line x1={cx - d} y1={cy + d} x2={cx + d} y2={cy - d} />
                  </g>
                );
              }
              if (m === DOT) {
                return <circle key={`m-${r}-${c}`} cx={cx} cy={cy} r={3.5} fill={MARK} pointerEvents="none" />;
              }
              return null;
            })
          )}

          {loop.h.flatMap((row, r) =>
            row.map((x, c) =>
              x === 1 ? (
                <line key={`lh-${r}-${c}`} x1={(c + 0.5) * CELL} y1={(r + 0.5) * CELL} x2={(c + 1.5) * CELL}
                  y2={(r + 0.5) * CELL} stroke="#333" strokeWidth={4} strokeLinecap="round" pointerEvents="none" />
              ) : null
            )
          )}
          {loop.v.flatMap((row, r) =>
            row.map((x, c) =>
              x === 1 ? (
                <line key={`lv-${r}-${c}`} x1={(c + 0.5) * CELL} y1={(r + 0.5) * CELL} x2={(c + 0.5) * CELL}
                  y2={(r + 1.5) * CELL} stroke="#333" strokeWidth={4} strokeLinecap="round" pointerEvents="none" />
              ) : null
            )
          )}
        </g>
      </svg>
    </div>
  );
}
