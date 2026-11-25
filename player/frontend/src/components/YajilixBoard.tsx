import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { YajilixCanon } from "../types/canon";
import {
  Broken,
  CROSS,
  DOT,
  Loop,
  LoopClue,
  LoopClueGrid,
  arrowChar,
  brokenClues,
  dims,
  fromValues,
  toValues,
  validateYajilix,
} from "./yajilixRules";

interface LoopClueBoardProps<C extends LoopClueGrid> {
  canon: C;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
  validate: (canon: C, loop: Loop) => boolean;
  findBroken: (canon: C, loop: Loop, marks: number[][]) => Broken;
}

export const YAJILIX_CELL = 40;
export const YAJILIX_PAD = 12;
const CELL = YAJILIX_CELL;
const PAD = YAJILIX_PAD;
const ERROR = "#d32f2f";
const MARK = "#888";

/**
 * A clue as printed: letter (+ number, for Yajilix), the arrow above (left/right) or to the
 * right (up/down).
 */
export function YajilixClueGlyph({ clue, r, c, color }: { clue: LoopClue; r: number; c: number; color: string }) {
  const cx = (c + 0.5) * CELL;
  const cy = (r + 0.5) * CELL;
  const fs = CELL * 0.38;
  // A serif face so I can't be read as 1 or l.
  const letter = (
    <tspan fontFamily={clue.kind === "I" ? "Georgia, 'Times New Roman', serif" : "sans-serif"}>{clue.kind}</tspan>
  );
  if (clue.dir === "left" || clue.dir === "right") {
    return (
      <g pointerEvents="none" fill={color}>
        <text x={cx} y={cy - fs * 0.5} textAnchor="middle" dominantBaseline="central" fontSize={fs * 1.15}
          fontFamily="sans-serif" fontWeight="bold">
          {arrowChar(clue.dir)}
        </text>
        <text x={cx} y={cy + fs * 0.5} textAnchor="middle" dominantBaseline="central" fontSize={fs}
          fontFamily="sans-serif" fontWeight="bold">
          {letter}
          {clue.num ?? ""}
        </text>
      </g>
    );
  }
  return (
    <g pointerEvents="none" fill={color}>
      <text x={cx - fs * 0.35} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fs}
        fontFamily="sans-serif" fontWeight="bold">
        {letter}
        {clue.num ?? ""}
      </text>
      <text x={cx + fs * 0.85} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fs * 1.15}
        fontFamily="sans-serif" fontWeight="bold">
        {arrowChar(clue.dir)}
      </text>
    </g>
  );
}

/** Dashed grid, solid border and clues; shared with the editor. */
export function YajilixGrid({
  canon,
  badClues,
  badCells,
}: {
  canon: LoopClueGrid;
  badClues?: Set<string>;
  badCells?: Set<string>;
}) {
  const { rows, cols } = dims(canon);
  const out: JSX.Element[] = [];
  out.push(<rect key="bg" x={0} y={0} width={cols * CELL} height={rows * CELL} fill="white" />);
  badCells?.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    out.push(<rect key={`bad-${key}`} x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill="#fde0e0" />);
  });
  for (let i = 1; i < rows; i++) {
    out.push(<line key={`gh-${i}`} x1={0} y1={i * CELL} x2={cols * CELL} y2={i * CELL}
      stroke="#999" strokeWidth={0.8} strokeDasharray="4 3" />);
  }
  for (let i = 1; i < cols; i++) {
    out.push(<line key={`gv-${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={rows * CELL}
      stroke="#999" strokeWidth={0.8} strokeDasharray="4 3" />);
  }
  out.push(<rect key="border" x={0} y={0} width={cols * CELL} height={rows * CELL} fill="none" stroke="#222" strokeWidth={2.5} />);
  canon.cells.forEach((row, r) =>
    row.forEach((clue, c) => {
      if (!clue) return;
      const bad = badClues?.has(`${r},${c}`);
      out.push(<YajilixClueGlyph key={`clue-${r}-${c}`} clue={clue} r={r} c={c} color={bad ? ERROR : "#111"} />);
    })
  );
  return <>{out}</>;
}

type YajilixBoardProps = Omit<LoopClueBoardProps<YajilixCanon>, "validate" | "findBroken">;

export default function YajilixBoard(props: YajilixBoardProps) {
  return <LoopClueBoard {...props} validate={validateYajilix} findBroken={brokenClues} />;
}

/**
 * The board shared by Yajilix and Majority Yajilix: loop drag, × / • marks, clues as
 * printed. [validate] decides completion and [findBroken] what Errors: On marks.
 */
export function LoopClueBoard<C extends LoopClueGrid>({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
  validate,
  findBroken,
}: LoopClueBoardProps<C>) {
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
    if (validate(canon, loop)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [loop, canon, onComplete, validate]);

  const isClue = useCallback((r: number, c: number) => canon.cells[r]?.[c] != null, [canon]);

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

  // Drag through neighbouring cells: the first edge crossed decides draw or erase. Edges
  // into or out of a clue cell are never drawn (erasing one is allowed).
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
    if (value === 1 && (isClue(last.r, last.c) || isClue(cell.r, cell.c))) return;
    setLoop((prev) => {
      const next = { h: prev.h.map((row) => [...row]), v: prev.v.map((row) => [...row]) };
      (horizontal ? next.h : next.v)[r][c] = value;
      return next;
    });
  };

  // A tap without a drag cycles an empty cell's mark: none -> × -> • -> none (right click back).
  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const cell = lastRef.current;
    lastRef.current = null;
    if (draggedRef.current || !cell || readonly || isClue(cell.r, cell.c)) return;
    const back = e.button === 2;
    setMarks((prev) => {
      const next = prev.map((row) => [...row]);
      next[cell.r][cell.c] = (next[cell.r][cell.c] + (back ? 2 : 1)) % 3;
      return next;
    });
  };

  const broken = useMemo(
    () => (liveValidate ? findBroken(canon, loop, marks) : null),
    [liveValidate, canon, loop, marks, findBroken]
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
          <YajilixGrid canon={canon} badClues={broken?.clues} badCells={broken?.cells} />

          {marks.flatMap((row, r) =>
            row.map((m, c) => {
              if (isClue(r, c)) return null;
              const cx = (c + 0.5) * CELL;
              const cy = (r + 0.5) * CELL;
              if (m === CROSS) {
                const d = CELL * 0.16;
                return (
                  <g key={`m-${r}-${c}`} stroke={MARK} strokeWidth={2} pointerEvents="none">
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
