import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoardUiState } from "../hooks/useBoardUiState";
import { IrregularNonogramCanon } from "../types/canon";
import {
  cellState,
  clueLayout,
  clueStatus,
  cluesBySegment,
  isIrregularNonogramSolved,
  layoutBounds,
  segmentKey,
  segments,
} from "./irregularNonogramRules";

export const IN_CELL = 21;
export const IN_PAD = 8;

const BOARD_BG = "#fff";
const CLUE_BG = "#f1f1f1";
const THIN = "#bbb";
const THICK = "#222";
const CLUE_TEXT = "#222";
const CLUE_DONE = "#aaa";
const ERROR = "#d33";
const FILL = "#111";
const CROSS = "#999";
const THUMB_BG = "#d9d9d9";

type DrawMode = "fill" | "cross";

/** Bounds of the drawing on the lattice, [minRow, minCol, maxRow, maxCol]. */
export type Bounds = [number, number, number, number];

/**
 * The board drawn on its lattice: clue blocks, board cells with thin lines and thick
 * every-5 lines, the board outline, player fills. Coordinates are lattice cells offset by
 * the bounds' minimum (so a clue block above row 0 is drawn). Shared by the editor.
 */
export function IrregularNonogramDrawing({
  canon,
  bounds,
  values = {},
  satisfied,
  broken,
  numbers,
  liveValidate,
  marks,
  selected,
  showLattice,
}: {
  canon: IrregularNonogramCanon;
  bounds: Bounds;
  values?: Record<string, number>;
  satisfied?: Set<string>;
  broken?: Set<string>;
  /** Per-number status of each segment's clue (Nonogram's greying). */
  numbers?: Map<string, ("normal" | "satisfied" | "error")[]>;
  /** Errors on: red numbers and broken blocks. */
  liveValidate?: boolean;
  /** Cell outlines by "r,c" (problems, warnings). */
  marks?: Map<string, string>;
  /** Highlighted cells by "r,c" (the editor's selected segments). */
  selected?: Set<string>;
  /** Faint lattice outside the board (the editor's shape mode). */
  showLattice?: boolean;
}) {
  const [minR, minC, maxR, maxC] = bounds;
  const x = (c: number) => (c - minC) * IN_CELL;
  const y = (r: number) => (r - minR) * IN_CELL;
  const isBoard = (r: number, c: number) => r >= 0 && c >= 0 && r < canon.height && c < canon.width && canon.cells[r]?.[c] === 1;
  const segs = useMemo(() => segments(canon), [canon]);
  const clued = useMemo(() => cluesBySegment(canon), [canon]);

  const boardCells: [number, number][] = [];
  for (let r = 0; r < canon.height; r++) for (let c = 0; c < canon.width; c++) if (isBoard(r, c)) boardCells.push([r, c]);

  // Clue blocks: [segment key, [r, c, value][]].
  const blocks: [string, [number, number, number][]][] = [];
  for (const s of segs) {
    const key = segmentKey(s.axis, s.line, s.start);
    const ref = clued.get(key);
    if (ref) blocks.push([key, clueLayout(ref, s.length)]);
  }

  // Lattice lines between two board cells, or between a board cell and the outside.
  const lines: React.ReactElement[] = [];
  const thick = (i: number) => ((i % 5) + 5) % 5 === 0;
  for (const [r, c] of boardCells) {
    // Top and left edges of every board cell; bottom/right only where the board ends.
    const edges: [number, number, number, number, boolean][] = [
      [x(c), y(r), x(c + 1), y(r), !isBoard(r - 1, c) || thick(r)],
      [x(c), y(r), x(c), y(r + 1), !isBoard(r, c - 1) || thick(c)],
    ];
    if (!isBoard(r + 1, c)) edges.push([x(c), y(r + 1), x(c + 1), y(r + 1), true]);
    if (!isBoard(r, c + 1)) edges.push([x(c + 1), y(r), x(c + 1), y(r + 1), true]);
    for (const [x1, y1, x2, y2, heavy] of edges) {
      lines.push(
        <line key={`${x1},${y1},${x2},${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={heavy ? THICK : THIN} strokeWidth={heavy ? 2 : 1} strokeLinecap="square" />
      );
    }
  }

  return (
    <g>
      {showLattice &&
        Array.from({ length: maxR - minR + 1 }, (_, i) => minR + i).flatMap((r) =>
          Array.from({ length: maxC - minC + 1 }, (_, j) => minC + j).map((c) => (
            <rect key={`l${r},${c}`} x={x(c)} y={y(r)} width={IN_CELL} height={IN_CELL} fill="none" stroke="#eee" strokeWidth={1} />
          ))
        )}
      {blocks.map(([key, cells]) => {
        const done = satisfied?.has(key);
        const bad = liveValidate && broken?.has(key);
        const perNumber = numbers?.get(key);
        // Nonogram's colours: a settled number grey (always), a contradicted one red
        // (errors on only).
        const colour = (i: number) => {
          const st = done ? "satisfied" : perNumber?.[i];
          if (st === "satisfied") return CLUE_DONE;
          if (st === "error" && liveValidate) return ERROR;
          return CLUE_TEXT;
        };
        return (
          <g key={`b${key}`}>
            {cells.map(([r, c, v], i) => (
              <g key={`${r},${c}`}>
                <rect x={x(c)} y={y(r)} width={IN_CELL} height={IN_CELL} fill={CLUE_BG} stroke={bad ? ERROR : "#ccc"} strokeWidth={bad ? 2 : 1} strokeDasharray={bad ? undefined : "2 2"} />
                <text
                  x={x(c) + IN_CELL / 2}
                  y={y(r) + IN_CELL / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={v >= 10 ? 10 : 13}
                  fontWeight={600}
                  fill={colour(i)}
                  pointerEvents="none"
                >
                  {v}
                </text>
              </g>
            ))}
          </g>
        );
      })}
      {boardCells.map(([r, c]) => {
        const s = cellState(values, r, c);
        const sel = selected?.has(`${r},${c}`);
        return (
          <g key={`c${r},${c}`}>
            <rect x={x(c)} y={y(r)} width={IN_CELL} height={IN_CELL} fill={s === 1 ? FILL : sel ? "#dbe8ff" : BOARD_BG} />
            {s === 2 && (
              <g stroke={CROSS} strokeWidth={1.5}>
                <line x1={x(c) + 6} y1={y(r) + 6} x2={x(c) + IN_CELL - 6} y2={y(r) + IN_CELL - 6} />
                <line x1={x(c) + IN_CELL - 6} y1={y(r) + 6} x2={x(c) + 6} y2={y(r) + IN_CELL - 6} />
              </g>
            )}
          </g>
        );
      })}
      {lines}
      {marks &&
        [...marks].map(([key, color]) => {
          const [r, c] = key.split(",").map(Number);
          return <rect key={`m${key}`} x={x(c) + 3} y={y(r) + 3} width={IN_CELL - 6} height={IN_CELL - 6} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 2" />;
        })}
    </g>
  );
}

/** The filled cells as a picture: black on grey, as Nonogram's preview. */
function Preview({ canon, values }: { canon: IrregularNonogramCanon; values: Record<string, number> }) {
  const t = Math.max(3, Math.min(8, Math.floor(160 / canon.width), Math.floor(160 / canon.height)));
  const d: string[] = [];
  for (let r = 0; r < canon.height; r++) {
    for (let c = 0; c < canon.width; c++) {
      if (canon.cells[r]?.[c] === 1 && cellState(values, r, c) === 1) d.push(`M${c * t} ${r * t}h${t}v${t}h${-t}z`);
    }
  }
  return (
    <svg width={t * canon.width} height={t * canon.height} style={{ border: "1px solid #aaa", background: THUMB_BG, display: "block" }} shapeRendering="crispEdges">
      <path d={d.join("")} fill="#000" />
    </svg>
  );
}

interface IrregularNonogramBoardProps {
  canon: IrregularNonogramCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

/**
 * Irregular Nonogram (type 45): Nonogram's input on an irregular board. Fill / cross mode
 * buttons; a drag paints the mode's state (right-drag crosses in fill mode), and a drag
 * that starts on a cell already in that state clears instead. Values are Nonogram's
 * ("col,row" -> 1 filled / 2 crossed). Clue blocks grey out once their piece matches and,
 * with Errors on, turn red when its marks can no longer fit.
 */
export default function IrregularNonogramBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: IrregularNonogramBoardProps) {
  const [values, setValues] = useState<Record<string, number>>(() => initialUserValues ?? {});
  const [drawMode, setDrawMode] = useBoardUiState<DrawMode>("nonogram.drawMode", "fill");
  const dragState = useRef<number | null>(null);
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const bounds = useMemo(() => layoutBounds(canon), [canon]);
  const [minR, minC, maxR, maxC] = bounds;
  const svgWidth = (maxC - minC + 1) * IN_CELL + IN_PAD * 2;
  const svgHeight = (maxR - minR + 1) * IN_CELL + IN_PAD * 2;
  const status = useMemo(() => clueStatus(canon, values), [canon, values]);

  useEffect(() => {
    onValuesChange?.(values);
    if (!completedRef.current && isIrregularNonogramSolved(canon, values)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [values, canon, onValuesChange, onComplete]);

  const cellAt = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      const c = Math.floor(((clientX - rect.left) * scale - IN_PAD) / IN_CELL) + minC;
      const r = Math.floor(((clientY - rect.top) * scale - IN_PAD) / IN_CELL) + minR;
      return canon.cells[r]?.[c] === 1 ? [r, c] : null;
    },
    [svgWidth, minC, minR, canon]
  );

  const paint = (r: number, c: number, state: number) =>
    setValues((prev) => {
      const key = `${c},${r}`;
      if ((prev[key] ?? 0) === state) return prev;
      const next = { ...prev };
      if (state === 0) delete next[key];
      else next[key] = state;
      return next;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (readonly) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const target = drawMode === "cross" || e.button === 2 ? 2 : 1;
    const current = cellState(values, cell[0], cell[1]);
    dragState.current = current === target ? 0 : target;
    paint(cell[0], cell[1], dragState.current);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragState.current === null) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell) paint(cell[0], cell[1], dragState.current);
  };

  const endDrag = () => {
    dragState.current = null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {!readonly && <Preview canon={canon} values={values} />}
      <div style={{ maxWidth: svgWidth, width: "100%", overflowX: "auto" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ userSelect: "none", display: "block", touchAction: "none", background: "#fff" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${IN_PAD},${IN_PAD})`}>
            <IrregularNonogramDrawing
              canon={canon}
              bounds={bounds}
              values={values}
              satisfied={status.satisfied}
              broken={status.broken}
              numbers={status.numbers}
              liveValidate={liveValidate}
            />
          </g>
        </svg>
      </div>
      {!readonly && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setDrawMode("fill")}
            style={{
              width: 36,
              height: 36,
              background: drawMode === "fill" ? "#222" : "#ddd",
              border: drawMode === "fill" ? "3px solid #0066ff" : "2px solid #999",
              borderRadius: 4,
              cursor: "pointer",
            }}
            title="Fill mode (left-drag: fill, right-drag: cross)"
          />
          <button
            onClick={() => setDrawMode("cross")}
            style={{
              width: 36,
              height: 36,
              background: "#fff",
              border: drawMode === "cross" ? "3px solid #0066ff" : "2px solid #999",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 18,
              fontWeight: "bold",
              color: "#999",
            }}
            title="Cross mode (all drag marks crossed)"
          >
            X
          </button>
        </div>
      )}
    </div>
  );
}
