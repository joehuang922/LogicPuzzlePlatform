import { useState, useEffect, useCallback, useRef } from "react";
import { HellGolfCanon, HellGolfAnswer } from "../types/canon";

interface HellGolfBoardProps {
  canon: HellGolfCanon;
  initialAnswer?: HellGolfAnswer | null;
  onAnswerChange?: (answer: HellGolfAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 44;
const PAD = 20;
const BALL_RADIUS = 15;

// Distinct color per ball so overlapping regions stay legible.
const BALL_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c",
  "#0891b2", "#db2777", "#ca8a04", "#4f46e5", "#0d9488",
  "#be123c", "#65a30d", "#7c3aed", "#c2410c", "#0369a1",
];

type Cell = { r: number; c: number };

const key = (r: number, c: number) => `${r},${c}`;

// Cells traversed going straight from `a` to `b`, inclusive of `b`, exclusive of `a`.
function cellsBetween(a: Cell, b: Cell): Cell[] {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const out: Cell[] = [];
  let cur = { ...a };
  while (cur.r !== b.r || cur.c !== b.c) {
    cur = { r: cur.r + dr, c: cur.c + dc };
    out.push({ ...cur });
  }
  return out;
}

// Every cell a trail occupies: all stops plus the cells its segments slide over.
function coveredCells(path: number[][]): Cell[] {
  if (path.length === 0) return [];
  const out: Cell[] = [{ r: path[0][0], c: path[0][1] }];
  for (let i = 1; i < path.length; i++) {
    const a = { r: path[i - 1][0], c: path[i - 1][1] };
    const b = { r: path[i][0], c: path[i][1] };
    out.push(...cellsBetween(a, b));
  }
  return out;
}

export default function HellGolfBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: HellGolfBoardProps) {
  const { lakes, balls, goals } = canon;
  const rows = lakes.length;
  const cols = lakes[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const goalSet = useRef(new Set(goals.map(([r, c]) => key(r, c)))).current;
  const originSet = useRef(
    new Set(balls.map((b) => key(b.r, b.c)))
  ).current;

  const initTrails = useCallback(
    (): number[][][] =>
      initialAnswer?.trails?.length === balls.length
        ? initialAnswer.trails.map((t) => t.path.map((p) => [...p]))
        : balls.map((b) => [[b.r, b.c]]),
    [initialAnswer, balls]
  );

  const [trails, setTrails] = useState<number[][][]>(initTrails);
  const [selected, setSelected] = useState<number | null>(null);
  const completedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    onAnswerChange?.({ trails: trails.map((path) => ({ path })) });
  }, [trails, onAnswerChange]);

  // Current number of a ball = starting number minus moves already made.
  const currentNumber = useCallback(
    (i: number) => balls[i].n - (trails[i].length - 1),
    [balls, trails]
  );
  const headOf = useCallback(
    (i: number): Cell => {
      const p = trails[i][trails[i].length - 1];
      return { r: p[0], c: p[1] };
    },
    [trails]
  );
  const endedOn = useCallback(
    (i: number) => {
      const h = headOf(i);
      return goalSet.has(key(h.r, h.c));
    },
    [headOf, goalSet]
  );

  // A ball can move if it hasn't landed on a goal and still has moves left.
  const canMove = useCallback(
    (i: number) => !endedOn(i) && currentNumber(i) > 0,
    [endedOn, currentNumber]
  );

  const isLake = useCallback(
    (r: number, c: number) =>
      r >= 0 && r < rows && c >= 0 && c < cols && lakes[r][c] === 1,
    [lakes, rows, cols]
  );

  // Returns the landing cell if moving ball `i` in (dr,dc) is legal, else null.
  const tryMove = useCallback(
    (i: number, dr: number, dc: number): Cell | null => {
      const k = currentNumber(i);
      if (k <= 0) return null;
      const from = headOf(i);
      const traversed = cellsBetween(from, {
        r: from.r + dr * k,
        c: from.c + dc * k,
      });
      const landing = traversed[traversed.length - 1];

      // Occupancy from other trails and other ball origins.
      const otherCovered = new Set<string>();
      trails.forEach((path, j) => {
        if (j === i) return;
        for (const cell of coveredCells(path)) otherCovered.add(key(cell.r, cell.c));
      });
      const selfCovered = new Set(
        coveredCells(trails[i]).map((cell) => key(cell.r, cell.c))
      );
      const occupiedGoals = new Set<string>();
      trails.forEach((path, j) => {
        if (j === i) return;
        const last = path[path.length - 1];
        if (goalSet.has(key(last[0], last[1])))
          occupiedGoals.add(key(last[0], last[1]));
      });

      for (let idx = 0; idx < traversed.length; idx++) {
        const cell = traversed[idx];
        const isLast = idx === traversed.length - 1;
        if (cell.r < 0 || cell.r >= rows || cell.c < 0 || cell.c >= cols)
          return null;
        const kk = key(cell.r, cell.c);
        if (otherCovered.has(kk)) return null; // would cross another trail
        if (selfCovered.has(kk)) return null; // would self-intersect
        if (originSet.has(kk) && kk !== key(from.r, from.c)) return null; // crosses a ball
        if (goalSet.has(kk)) {
          if (!isLast) return null; // may not slide over a goal
          if (occupiedGoals.has(kk)) return null; // goal already taken
        }
      }
      if (isLake(landing.r, landing.c)) return null; // may not stop on a lake
      return landing;
    },
    [
      currentNumber, headOf, trails, rows, cols, goalSet, originSet, isLake,
    ]
  );

  // Legal landing cells for the currently selected ball.
  const reachable = useCallback((): Cell[] => {
    if (selected === null || !canMove(selected)) return [];
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
    ];
    return dirs
      .map(([dr, dc]) => tryMove(selected, dr, dc))
      .filter((cell): cell is Cell => cell !== null);
  }, [selected, canMove, tryMove]);

  const validateSolution = useCallback(
    (t: number[][][]): boolean => {
      const usedGoals = new Set<string>();
      for (let i = 0; i < balls.length; i++) {
        const path = t[i];
        if (path.length === 0) return false;
        const last = path[path.length - 1];
        const kk = key(last[0], last[1]);
        if (!goalSet.has(kk)) return false; // must end on a goal
        if (usedGoals.has(kk)) return false; // bijection
        usedGoals.add(kk);
      }
      return usedGoals.size === goals.length;
    },
    [balls.length, goalSet, goals.length]
  );

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(trails)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [trails, validateSolution, onComplete]);

  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number): Cell | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      const x = (clientX - rect.left) * scale - PAD;
      const y = (clientY - rect.top) * scale - PAD;
      const c = Math.floor(x / CELL_SIZE);
      const r = Math.floor(y / CELL_SIZE);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
      return { r, c };
    },
    [rows, cols, svgWidth]
  );

  const ballAtHead = useCallback(
    (cell: Cell): number | null => {
      for (let i = 0; i < balls.length; i++) {
        const h = headOf(i);
        if (h.r === cell.r && h.c === cell.c) return i;
      }
      return null;
    },
    [balls.length, headOf]
  );

  const moveTo = useCallback(
    (i: number, landing: Cell) => {
      setTrails((prev) => {
        const next = prev.map((path) => path.map((p) => [...p]));
        next[i].push([landing.r, landing.c]);
        return next;
      });
    },
    []
  );

  const undoLast = useCallback((i: number) => {
    setTrails((prev) => {
      if (prev[i].length <= 1) return prev;
      const next = prev.map((path) => path.map((p) => [...p]));
      next[i].pop();
      return next;
    });
  }, []);

  const handleClick = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) {
        setSelected(null);
        return;
      }

      if (selected !== null) {
        // Click a highlighted landing cell to move.
        const landing = reachable().find(
          (l) => l.r === cell.r && l.c === cell.c
        );
        if (landing) {
          moveTo(selected, landing);
          return;
        }
        // Click the previous stop of the selected trail to undo.
        const path = trails[selected];
        if (path.length > 1) {
          const prevStop = path[path.length - 2];
          if (prevStop[0] === cell.r && prevStop[1] === cell.c) {
            undoLast(selected);
            return;
          }
        }
      }

      // Otherwise (re)select whichever ball sits under the click.
      const idx = ballAtHead(cell);
      setSelected((cur) => (idx !== null && idx === cur ? null : idx));
    },
    [
      readonly, getCellFromPoint, selected, reachable, moveTo, trails,
      undoLast, ballAtHead,
    ]
  );

  const landings = reachable();

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", touchAction: "none" }}
        onPointerDown={handleClick}
      >
        <defs>
          {BALL_COLORS.map((color, i) => (
            <marker
              key={`arrow-${i}`}
              id={`hg-arrow-${i}`}
              markerWidth={6}
              markerHeight={6}
              refX={4}
              refY={3}
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill={color} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Lake cells */}
          {lakes.flatMap((row, r) =>
            row.map((v, c) =>
              v === 1 ? (
                <rect
                  key={`lake-${r}-${c}`}
                  x={c * CELL_SIZE}
                  y={r * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill="#9ca3af"
                />
              ) : null
            )
          )}

          {/* Outer border */}
          <rect
            x={0}
            y={0}
            width={cols * CELL_SIZE}
            height={rows * CELL_SIZE}
            fill="none"
            stroke="#222"
            strokeWidth={2}
          />
          {/* Inner grid lines (dashed) */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line
              key={`grid-h-${i}`}
              x1={0}
              y1={(i + 1) * CELL_SIZE}
              x2={cols * CELL_SIZE}
              y2={(i + 1) * CELL_SIZE}
              stroke="#bbb"
              strokeWidth={0.5}
              strokeDasharray="4 3"
            />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line
              key={`grid-v-${i}`}
              x1={(i + 1) * CELL_SIZE}
              y1={0}
              x2={(i + 1) * CELL_SIZE}
              y2={rows * CELL_SIZE}
              stroke="#bbb"
              strokeWidth={0.5}
              strokeDasharray="4 3"
            />
          ))}

          {/* Thick borders around lake regions */}
          {lakes.flatMap((row, r) =>
            row.flatMap((v, c) => {
              if (v !== 1) return [];
              const segs: JSX.Element[] = [];
              const x = c * CELL_SIZE;
              const y = r * CELL_SIZE;
              if (!isLake(r - 1, c))
                segs.push(
                  <line key={`lb-t-${r}-${c}`} x1={x} y1={y} x2={x + CELL_SIZE} y2={y} stroke="#4b5563" strokeWidth={3} />
                );
              if (!isLake(r + 1, c))
                segs.push(
                  <line key={`lb-b-${r}-${c}`} x1={x} y1={y + CELL_SIZE} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke="#4b5563" strokeWidth={3} />
                );
              if (!isLake(r, c - 1))
                segs.push(
                  <line key={`lb-l-${r}-${c}`} x1={x} y1={y} x2={x} y2={y + CELL_SIZE} stroke="#4b5563" strokeWidth={3} />
                );
              if (!isLake(r, c + 1))
                segs.push(
                  <line key={`lb-r-${r}-${c}`} x1={x + CELL_SIZE} y1={y} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke="#4b5563" strokeWidth={3} />
                );
              return segs;
            })
          )}

          {/* Trails (arrows) */}
          {trails.flatMap((path, i) => {
            const color = BALL_COLORS[i % BALL_COLORS.length];
            return path.slice(1).map((stop, si) => {
              const from = path[si];
              return (
                <line
                  key={`trail-${i}-${si}`}
                  x1={(from[1] + 0.5) * CELL_SIZE}
                  y1={(from[0] + 0.5) * CELL_SIZE}
                  x2={(stop[1] + 0.5) * CELL_SIZE}
                  y2={(stop[0] + 0.5) * CELL_SIZE}
                  stroke={color}
                  strokeWidth={4}
                  strokeLinecap="round"
                  markerEnd={`url(#hg-arrow-${i % BALL_COLORS.length})`}
                  pointerEvents="none"
                />
              );
            });
          })}

          {/* Goals */}
          {goals.map(([r, c], i) => {
            const cx = (c + 0.5) * CELL_SIZE;
            const cy = (r + 0.5) * CELL_SIZE;
            const filled = trails.some((path) => {
              const last = path[path.length - 1];
              return last[0] === r && last[1] === c;
            });
            return (
              <text
                key={`goal-${i}`}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={24}
                fontWeight={700}
                fill={filled ? "#16a34a" : "#374151"}
                pointerEvents="none"
              >
                H
              </text>
            );
          })}

          {/* Reachable landing markers for the selected ball */}
          {landings.map((l, i) => (
            <circle
              key={`land-${i}`}
              cx={(l.c + 0.5) * CELL_SIZE}
              cy={(l.r + 0.5) * CELL_SIZE}
              r={BALL_RADIUS - 2}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2.5}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          ))}

          {/* Balls at their current head positions */}
          {balls.map((_, i) => {
            const h = headOf(i);
            const cx = (h.c + 0.5) * CELL_SIZE;
            const cy = (h.r + 0.5) * CELL_SIZE;
            const color = BALL_COLORS[i % BALL_COLORS.length];
            const num = currentNumber(i);
            const done = endedOn(i);
            return (
              <g key={`ball-${i}`} pointerEvents="none">
                <circle
                  cx={cx}
                  cy={cy}
                  r={BALL_RADIUS}
                  fill="#fff"
                  stroke={color}
                  strokeWidth={selected === i ? 4 : 2.5}
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={16}
                  fontWeight={700}
                  fill={done ? "#16a34a" : color}
                >
                  {done ? "✓" : num}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
