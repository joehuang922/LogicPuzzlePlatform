import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ShikakuCanon, ShikakuRect } from "../types/canon";

interface ShikakuBoardProps {
  canon: ShikakuCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 40;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const HANDLE_R = 9; // pixel radius for grabbing a rectangle corner to resize

// Encode/decode a rectangle's (w, h) into a single numeric user value.
const encodeWH = (w: number, h: number) => w * 1000 + h;
const decodeWH = (val: number) => ({ w: Math.floor(val / 1000), h: val % 1000 });

function rectKey(r: number, c: number) {
  return `rect:${r},${c}`;
}

// Do two rectangles share any cell?
function overlaps(a: ShikakuRect, b: ShikakuRect): boolean {
  return (
    a.c < b.c + b.w &&
    b.c < a.c + a.w &&
    a.r < b.r + b.h &&
    b.r < a.r + a.h
  );
}

// How many clue cells fall inside a rectangle, and (if exactly one) its value.
function clueInfo(rect: ShikakuRect, cells: number[][]) {
  let count = 0;
  let value = 0;
  for (let r = rect.r; r < rect.r + rect.h; r++) {
    for (let c = rect.c; c < rect.c + rect.w; c++) {
      if (cells[r][c] > 0) {
        count++;
        value = cells[r][c];
      }
    }
  }
  return { count, value };
}

function validateSolution(canon: ShikakuCanon, rects: ShikakuRect[]): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Every cell covered exactly once (overlaps are prevented on input, so
  // full coverage with the right rect count implies a clean tiling).
  const cover: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const rect of rects) {
    for (let r = rect.r; r < rect.r + rect.h; r++) {
      for (let c = rect.c; c < rect.c + rect.w; c++) {
        cover[r][c]++;
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cover[r][c] !== 1) return false;
    }
  }

  // Each rectangle contains exactly one clue and its area matches that clue.
  for (const rect of rects) {
    const { count, value } = clueInfo(rect, canon.cells);
    if (count !== 1) return false;
    if (rect.w * rect.h !== value) return false;
  }

  return true;
}

export default function ShikakuBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: ShikakuBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const initialRects = useMemo(() => {
    const list: ShikakuRect[] = [];
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        if (!key.startsWith("rect:")) continue;
        const [rStr, cStr] = key.slice(5).split(",");
        const r = parseInt(rStr);
        const c = parseInt(cStr);
        const { w, h } = decodeWH(val);
        if (
          Number.isFinite(r) &&
          Number.isFinite(c) &&
          w >= 1 &&
          h >= 1 &&
          r >= 0 &&
          c >= 0 &&
          r + h <= rows &&
          c + w <= cols
        ) {
          list.push({ r, c, w, h });
        }
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rects, setRects] = useState<ShikakuRect[]>(initialRects);
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Active drag: either drawing a new rect or resizing an existing one.
  type Drag =
    | { mode: "draw"; anchor: [number, number]; cur: [number, number] }
    | { mode: "resize"; index: number; anchor: [number, number]; cur: [number, number] }
    | { mode: "erase"; index: number };
  const [drag, setDrag] = useState<Drag | null>(null);

  // Serialize rects into flat numeric user values.
  const serializeValues = useCallback((): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const rect of rects) {
      result[rectKey(rect.r, rect.c)] = encodeWH(rect.w, rect.h);
    }
    return result;
  }, [rects]);

  useEffect(() => {
    onValuesChange?.(serializeValues());
  }, [serializeValues, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(canon, rects)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [rects, canon, onComplete]);

  // Map a pointer event to grid pixel coordinates (relative to grid origin).
  const toGrid = useCallback((e: React.PointerEvent): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * svgWidth - PAD;
    const py = ((e.clientY - box.top) / box.height) * svgHeight - PAD;
    return [px, py];
  }, [svgWidth, svgHeight]);

  const toCell = (px: number, py: number): [number, number] => {
    const c = Math.max(0, Math.min(cols - 1, Math.floor(px / CELL_SIZE)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor(py / CELL_SIZE)));
    return [r, c];
  };

  // Bounding box (as a rect) spanning two cells.
  const boundsToRect = (a: [number, number], b: [number, number]): ShikakuRect => {
    const r0 = Math.min(a[0], b[0]);
    const r1 = Math.max(a[0], b[0]);
    const c0 = Math.min(a[1], b[1]);
    const c1 = Math.max(a[1], b[1]);
    return { r: r0, c: c0, w: c1 - c0 + 1, h: r1 - r0 + 1 };
  };

  // Which rectangle covers a given cell (or -1).
  const rectAtCell = (r: number, c: number): number =>
    rects.findIndex(
      (rect) => r >= rect.r && r < rect.r + rect.h && c >= rect.c && c < rect.c + rect.w
    );

  // Find a rectangle corner near the pointer; returns the rect index and the
  // anchor cell (the opposite corner, which stays fixed during a resize).
  const cornerHit = (px: number, py: number): { index: number; anchor: [number, number] } | null => {
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const left = rect.c * CELL_SIZE;
      const right = (rect.c + rect.w) * CELL_SIZE;
      const top = rect.r * CELL_SIZE;
      const bottom = (rect.r + rect.h) * CELL_SIZE;
      const corners: Array<{ x: number; y: number; anchor: [number, number] }> = [
        { x: left, y: top, anchor: [rect.r + rect.h - 1, rect.c + rect.w - 1] },
        { x: right, y: top, anchor: [rect.r + rect.h - 1, rect.c] },
        { x: left, y: bottom, anchor: [rect.r, rect.c + rect.w - 1] },
        { x: right, y: bottom, anchor: [rect.r, rect.c] },
      ];
      for (const corner of corners) {
        if (Math.hypot(px - corner.x, py - corner.y) <= HANDLE_R) {
          return { index: i, anchor: corner.anchor };
        }
      }
    }
    return null;
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const [px, py] = toGrid(e);
      const [r, c] = toCell(px, py);

      // 1. Corner of an existing rect -> resize.
      const hit = cornerHit(px, py);
      if (hit) {
        setDrag({ mode: "resize", index: hit.index, anchor: hit.anchor, cur: [r, c] });
        return;
      }

      // 2. Interior of an existing rect -> candidate erase (on release).
      const idx = rectAtCell(r, c);
      if (idx >= 0) {
        setDrag({ mode: "erase", index: idx });
        return;
      }

      // 3. Empty cell -> draw a new rect.
      setDrag({ mode: "draw", anchor: [r, c], cur: [r, c] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readonly, rects, toGrid]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (readonly || !drag) return;
      if (drag.mode === "erase") return;
      const [px, py] = toGrid(e);
      const [r, c] = toCell(px, py);
      setDrag((prev) => {
        if (!prev || prev.mode === "erase") return prev;
        if (prev.cur[0] === r && prev.cur[1] === c) return prev;
        return { ...prev, cur: [r, c] };
      });
    },
    [readonly, drag, toGrid]
  );

  const handlePointerUp = useCallback(() => {
    if (readonly || !drag) {
      setDrag(null);
      return;
    }

    if (drag.mode === "erase") {
      setRects((prev) => prev.filter((_, i) => i !== drag.index));
      setDrag(null);
      return;
    }

    const candidate = boundsToRect(drag.anchor, drag.cur);
    const selfIndex = drag.mode === "resize" ? drag.index : -1;
    const collides = rects.some(
      (rect, i) => i !== selfIndex && overlaps(rect, candidate)
    );

    if (!collides) {
      completedRef.current = false;
      setRects((prev) => {
        if (drag.mode === "resize") {
          return prev.map((rect, i) => (i === drag.index ? candidate : rect));
        }
        return [...prev, candidate];
      });
    }
    setDrag(null);
  }, [readonly, drag, rects]);

  // ---- Rendering ----
  const previewRect =
    drag && drag.mode !== "erase" ? boundsToRect(drag.anchor, drag.cur) : null;
  const previewCollides =
    previewRect != null &&
    rects.some(
      (rect, i) => i !== (drag?.mode === "resize" ? drag.index : -1) && overlaps(rect, previewRect)
    );

  const regionFills: JSX.Element[] = [];
  const regionBorders: JSX.Element[] = [];
  const handles: JSX.Element[] = [];

  rects.forEach((rect, i) => {
    const { count, value } = clueInfo(rect, cells);
    let fill = "#9ca3af"; // gray: no clue
    if (count === 1 && rect.w * rect.h === value) {
      fill = "#22c55e"; // green: correct
    } else if (count >= 2 || (count === 1 && rect.w * rect.h !== value)) {
      fill = "#ef4444"; // red: wrong / multiple clues
    }
    const x = rect.c * CELL_SIZE;
    const y = rect.r * CELL_SIZE;
    const w = rect.w * CELL_SIZE;
    const h = rect.h * CELL_SIZE;
    regionFills.push(
      <rect
        key={`fill-${i}`}
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        fillOpacity={0.28}
        pointerEvents="none"
      />
    );
    regionBorders.push(
      <rect
        key={`border-${i}`}
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={fill}
        strokeWidth={THICK}
        pointerEvents="none"
      />
    );
    if (!readonly) {
      const corners: Array<[number, number]> = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
      corners.forEach(([cx, cy], k) => {
        handles.push(
          <circle
            key={`handle-${i}-${k}`}
            cx={cx}
            cy={cy}
            r={4}
            fill="white"
            stroke={fill}
            strokeWidth={2}
            pointerEvents="none"
          />
        );
      });
    }
  });

  // Grid lines (dashed interior, solid border).
  const gridLines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    const isBorder = r === 0 || r === rows;
    gridLines.push(
      <line
        key={`h-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={cols * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke="black"
        strokeWidth={isBorder ? THICK : THIN}
        strokeDasharray={isBorder ? undefined : "3,3"}
        pointerEvents="none"
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    const isBorder = c === 0 || c === cols;
    gridLines.push(
      <line
        key={`v-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={rows * CELL_SIZE}
        stroke="black"
        strokeWidth={isBorder ? THICK : THIN}
        strokeDasharray={isBorder ? undefined : "3,3"}
        pointerEvents="none"
      />
    );
  }

  // Clue circles.
  const clues: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = cells[r][c];
      if (val <= 0) continue;
      const cx = c * CELL_SIZE + CELL_SIZE / 2;
      const cy = r * CELL_SIZE + CELL_SIZE / 2;
      clues.push(
        <circle
          key={`clue-bg-${r}-${c}`}
          cx={cx}
          cy={cy}
          r={CELL_SIZE * 0.36}
          fill="#1f2937"
          pointerEvents="none"
        />
      );
      clues.push(
        <text
          key={`clue-${r}-${c}`}
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={CELL_SIZE * 0.38}
          fontFamily="sans-serif"
          fontWeight="bold"
          fill="white"
          pointerEvents="none"
        >
          {val}
        </text>
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            border: "1px solid #ccc",
            userSelect: "none",
            touchAction: "none",
            display: "block",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {regionFills}
            {gridLines}
            {regionBorders}
            {previewRect && (
              <rect
                x={previewRect.c * CELL_SIZE}
                y={previewRect.r * CELL_SIZE}
                width={previewRect.w * CELL_SIZE}
                height={previewRect.h * CELL_SIZE}
                fill={previewCollides ? "#ef4444" : "#3b82f6"}
                fillOpacity={0.2}
                stroke={previewCollides ? "#ef4444" : "#3b82f6"}
                strokeWidth={THICK}
                strokeDasharray="5,4"
                pointerEvents="none"
              />
            )}
            {handles}
            {clues}
          </g>
        </svg>
      </div>
    </div>
  );
}
