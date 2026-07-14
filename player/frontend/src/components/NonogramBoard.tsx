import { useState, useEffect, useCallback, useRef } from "react";
import { NonogramCanon, NonogramAnswer } from "../types/canon";

interface NonogramBoardProps {
  canon: NonogramCanon;
  initialAnswer?: NonogramAnswer | null;
  onAnswerChange?: (answer: NonogramAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 21;
const PAD = 8;

type CellState = 0 | 1 | 2; // 0=unset, 1=filled, 2=crossed
type DrawMode = "fill" | "cross";

function validateSolution(
  rowClues: number[][],
  colClues: number[][],
  cells: CellState[][]
): boolean {
  const rows = rowClues.length;
  const cols = colClues.length;

  function getGroups(line: CellState[]): number[] {
    const groups: number[] = [];
    let count = 0;
    for (const cell of line) {
      if (cell === 1) {
        count++;
      } else {
        if (count > 0) groups.push(count);
        count = 0;
      }
    }
    if (count > 0) groups.push(count);
    return groups.length === 0 ? [0] : groups;
  }

  function cluesMatch(actual: number[], expected: number[]): boolean {
    if (actual.length !== expected.length) return false;
    return actual.every((v, i) => v === expected[i]);
  }

  for (let r = 0; r < rows; r++) {
    if (!cluesMatch(getGroups(cells[r]), rowClues[r])) return false;
  }

  for (let c = 0; c < cols; c++) {
    const col: CellState[] = [];
    for (let r = 0; r < rows; r++) {
      col.push(cells[r][c]);
    }
    if (!cluesMatch(getGroups(col), colClues[c])) return false;
  }

  return true;
}

type ClueStatus = "normal" | "satisfied" | "error";

interface LineAnalysis {
  perClue: ClueStatus[];
  hasError: boolean;
  allSatisfied: boolean;
}

function analyzeLineStatus(clue: number[], line: CellState[]): LineAnalysis {
  const n = line.length;
  const clueLen = clue.length;

  // Extract "sealed" groups: groups of filled cells bounded by crossed (2) or edges
  // A group is sealed if it cannot grow further (both ends are crossed or edge)
  interface Group {
    start: number;
    end: number; // exclusive
    size: number;
    sealedLeft: boolean;
    sealedRight: boolean;
  }

  const groups: Group[] = [];
  let i = 0;
  while (i < n) {
    if (line[i] === 1) {
      const start = i;
      while (i < n && line[i] === 1) i++;
      const end = i;
      const sealedLeft = start === 0 || line[start - 1] === 2;
      const sealedRight = end === n || line[end] === 2;
      groups.push({ start, end, size: end - start, sealedLeft, sealedRight });
    } else {
      i++;
    }
  }

  const perClue: ClueStatus[] = Array(clueLen).fill("normal");

  // Check for full satisfaction first
  if (groups.length === clueLen && groups.every((g, idx) => g.size === clue[idx])) {
    return { perClue: Array(clueLen).fill("satisfied"), hasError: false, allSatisfied: true };
  }

  // Error detection: any sealed group larger than allowed, or more sealed groups than clues
  const sealedGroups = groups.filter((g) => g.sealedLeft && g.sealedRight);
  if (sealedGroups.length > clueLen) {
    return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
  }
  if (clueLen === 1 && clue[0] === 0) {
    // Clue is [0] meaning empty row — any filled cell is an error
    if (groups.length > 0) {
      return { perClue: ["error"], hasError: true, allSatisfied: false };
    }
    return { perClue: ["satisfied"], hasError: false, allSatisfied: true };
  }

  // Check for sealed groups that are too large for any clue
  for (const g of sealedGroups) {
    if (g.size > Math.max(...clue)) {
      return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
    }
  }

  // Partial satisfaction from the beginning:
  // Walk sealed groups from left; if they match clues in order, mark those clues satisfied
  let satisfiedFromStart = 0;
  for (const g of groups) {
    if (!g.sealedLeft || !g.sealedRight) break;
    if (satisfiedFromStart >= clueLen) break;
    if (g.size === clue[satisfiedFromStart]) {
      satisfiedFromStart++;
    } else {
      // Mismatch with expected clue — this is an error
      return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
    }
  }

  // Partial satisfaction from the end:
  let satisfiedFromEnd = 0;
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    if (!g.sealedLeft || !g.sealedRight) break;
    const clueIdx = clueLen - 1 - satisfiedFromEnd;
    if (clueIdx < satisfiedFromStart) break; // don't double-count
    if (g.size === clue[clueIdx]) {
      satisfiedFromEnd++;
    } else {
      return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
    }
  }

  // Additional error check: count all sealed groups between the satisfied ones
  // and verify they don't exceed remaining clues
  const remainingClues = clueLen - satisfiedFromStart - satisfiedFromEnd;
  const middleSealedGroups = sealedGroups.filter((g) => {
    // Groups not accounted for by start/end satisfaction
    const startBound = satisfiedFromStart > 0 ? groups[satisfiedFromStart - 1].end : 0;
    const endBound = satisfiedFromEnd > 0 ? groups[groups.length - satisfiedFromEnd].start : n;
    return g.start >= startBound && g.end <= endBound;
  });
  // Subtract the ones we already counted
  const uncountedMiddle = middleSealedGroups.length - 0; // all middle ones are uncounted
  if (uncountedMiddle > remainingClues) {
    return { perClue: Array(clueLen).fill("error"), hasError: true, allSatisfied: false };
  }

  // Mark satisfied clues
  for (let ci = 0; ci < satisfiedFromStart; ci++) {
    perClue[ci] = "satisfied";
  }
  for (let ci = 0; ci < satisfiedFromEnd; ci++) {
    perClue[clueLen - 1 - ci] = "satisfied";
  }

  return { perClue, hasError: false, allSatisfied: satisfiedFromStart + satisfiedFromEnd === clueLen };
}

function getColLine(cells: CellState[][], c: number): CellState[] {
  const col: CellState[] = [];
  for (let r = 0; r < cells.length; r++) {
    col.push(cells[r][c]);
  }
  return col;
}

export default function NonogramBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: NonogramBoardProps) {
  const { rowClues, colClues } = canon;
  const rows = rowClues.length;
  const cols = colClues.length;

  const maxRowClueLen = Math.max(...rowClues.map((c) => c.length));
  const maxColClueLen = Math.max(...colClues.map((c) => c.length));

  const emptyCells = (): CellState[][] =>
    Array.from({ length: rows }, () => Array(cols).fill(0));

  const [cells, setCells] = useState<CellState[][]>(
    () => (initialAnswer?.cells as CellState[][]) ?? emptyCells()
  );
  const [drawMode, setDrawMode] = useState<DrawMode>("fill");
  const [isDragging, setIsDragging] = useState(false);
  const dragTargetState = useRef<CellState>(1);
  const completedRef = useRef(false);

  useEffect(() => {
    const answer: NonogramAnswer = { cells };
    onAnswerChange?.(answer);
  }, [cells, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAny = cells.some((row) => row.some((v) => v === 1));
    if (!hasAny) return;
    if (validateSolution(rowClues, colClues, cells)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [cells, rowClues, colClues, onComplete]);

  const applyToCell = useCallback(
    (r: number, c: number, isRightButton: boolean) => {
      if (readonly) return;
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        let targetState: CellState;
        if (drawMode === "cross") {
          targetState = 2;
        } else {
          targetState = isRightButton ? 2 : 1;
        }
        if (next[r][c] === targetState) {
          next[r][c] = 0;
        } else {
          next[r][c] = targetState;
        }
        return next;
      });
    },
    [readonly, drawMode]
  );

  const startDrag = useCallback(
    (r: number, c: number, isRightButton: boolean) => {
      if (readonly) return;
      setIsDragging(true);
      let targetState: CellState;
      if (drawMode === "cross") {
        targetState = 2;
      } else {
        targetState = isRightButton ? 2 : 1;
      }
      dragTargetState.current = targetState;
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        if (next[r][c] === targetState) {
          next[r][c] = 0;
          dragTargetState.current = 0;
        } else {
          next[r][c] = targetState;
        }
        return next;
      });
    },
    [readonly, drawMode]
  );

  const continueDrag = useCallback(
    (r: number, c: number) => {
      if (!isDragging || readonly) return;
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = dragTargetState.current;
        return next;
      });
    },
    [isDragging, readonly]
  );

  const endDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => endDrag();
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [endDrag]);

  const clueAreaWidth = maxRowClueLen * CELL_SIZE;
  const clueAreaHeight = maxColClueLen * CELL_SIZE;
  const gridWidth = cols * CELL_SIZE;
  const gridHeight = rows * CELL_SIZE;
  const svgWidth = clueAreaWidth + gridWidth + PAD * 2;
  const svgHeight = clueAreaHeight + gridHeight + PAD * 2;

  const gridX = PAD + clueAreaWidth;
  const gridY = PAD + clueAreaHeight;

  const elements: JSX.Element[] = [];

  // Row clue area: vertical lines between number cells (dashed)
  for (let ci = 0; ci <= maxRowClueLen; ci++) {
    const x = PAD + ci * CELL_SIZE;
    const isEdge = ci === 0 || ci === maxRowClueLen;
    elements.push(
      <line
        key={`rcv-${ci}`}
        x1={x}
        y1={gridY}
        x2={x}
        y2={gridY + gridHeight}
        stroke={isEdge ? "#333" : "#999"}
        strokeWidth={isEdge ? 1.5 : 0.5}
        strokeDasharray={isEdge ? undefined : "3,3"}
      />
    );
  }
  // Row clue area: horizontal lines at row boundaries (solid)
  for (let r = 0; r <= rows; r++) {
    elements.push(
      <line
        key={`rch-${r}`}
        x1={PAD}
        y1={gridY + r * CELL_SIZE}
        x2={PAD + clueAreaWidth}
        y2={gridY + r * CELL_SIZE}
        stroke="#333"
        strokeWidth={r % 5 === 0 ? 1.5 : 0.5}
      />
    );
  }

  // Col clue area: horizontal lines between number cells (dashed)
  for (let ci = 0; ci <= maxColClueLen; ci++) {
    const y = PAD + ci * CELL_SIZE;
    const isEdge = ci === 0 || ci === maxColClueLen;
    elements.push(
      <line
        key={`cch-${ci}`}
        x1={gridX}
        y1={y}
        x2={gridX + gridWidth}
        y2={y}
        stroke={isEdge ? "#333" : "#999"}
        strokeWidth={isEdge ? 1.5 : 0.5}
        strokeDasharray={isEdge ? undefined : "3,3"}
      />
    );
  }
  // Col clue area: vertical lines at column boundaries (solid)
  for (let c = 0; c <= cols; c++) {
    elements.push(
      <line
        key={`ccv-${c}`}
        x1={gridX + c * CELL_SIZE}
        y1={PAD}
        x2={gridX + c * CELL_SIZE}
        y2={PAD + clueAreaHeight}
        stroke="#333"
        strokeWidth={c % 5 === 0 ? 1.5 : 0.5}
      />
    );
  }

  // Analyze all rows and columns
  const rowAnalyses = rowClues.map((clue, r) => analyzeLineStatus(clue, cells[r]));
  const colAnalyses = colClues.map((clue, c) => analyzeLineStatus(clue, getColLine(cells, c)));

  const clueColor = (status: ClueStatus) =>
    status === "satisfied" ? "#aaa" : status === "error" ? "#d33" : "#333";

  // Column clue numbers
  for (let c = 0; c < cols; c++) {
    const clue = colClues[c];
    const analysis = colAnalyses[c];
    for (let i = 0; i < clue.length; i++) {
      const x = gridX + c * CELL_SIZE + CELL_SIZE / 2;
      const y = gridY - (clue.length - i) * CELL_SIZE + CELL_SIZE / 2;
      elements.push(
        <text
          key={`cc-${c}-${i}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={CELL_SIZE * 0.55}
          fontFamily="sans-serif"
          fontWeight="bold"
          fill={clueColor(analysis.perClue[i])}
        >
          {clue[i]}
        </text>
      );
    }
  }

  // Row clue numbers
  for (let r = 0; r < rows; r++) {
    const clue = rowClues[r];
    const analysis = rowAnalyses[r];
    for (let i = 0; i < clue.length; i++) {
      const x = gridX - (clue.length - i) * CELL_SIZE + CELL_SIZE / 2;
      const y = gridY + r * CELL_SIZE + CELL_SIZE / 2;
      elements.push(
        <text
          key={`rc-${r}-${i}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={CELL_SIZE * 0.55}
          fontFamily="sans-serif"
          fontWeight="bold"
          fill={clueColor(analysis.perClue[i])}
        >
          {clue[i]}
        </text>
      );
    }
  }

  // Grid lines
  for (let r = 0; r <= rows; r++) {
    elements.push(
      <line
        key={`hg-${r}`}
        x1={gridX}
        y1={gridY + r * CELL_SIZE}
        x2={gridX + gridWidth}
        y2={gridY + r * CELL_SIZE}
        stroke={r % 5 === 0 ? "#333" : "#bbb"}
        strokeWidth={r % 5 === 0 ? 1.5 : 0.5}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    elements.push(
      <line
        key={`vg-${c}`}
        x1={gridX + c * CELL_SIZE}
        y1={gridY}
        x2={gridX + c * CELL_SIZE}
        y2={gridY + gridHeight}
        stroke={c % 5 === 0 ? "#333" : "#bbb"}
        strokeWidth={c % 5 === 0 ? 1.5 : 0.5}
      />
    );
  }

  // Cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gridX + c * CELL_SIZE;
      const y = gridY + r * CELL_SIZE;
      const hasError = rowAnalyses[r].hasError || colAnalyses[c].hasError;
      if (cells[r][c] === 1) {
        elements.push(
          <rect
            key={`cf-${r}-${c}`}
            x={x + 1}
            y={y + 1}
            width={CELL_SIZE - 2}
            height={CELL_SIZE - 2}
            fill={hasError ? "#d33" : "#222"}
          />
        );
      } else if (cells[r][c] === 2) {
        const cx = x + CELL_SIZE / 2;
        const cy = y + CELL_SIZE / 2;
        const s = CELL_SIZE * 0.25;
        elements.push(
          <g key={`cx-${r}-${c}`}>
            <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} stroke={hasError ? "#d33" : "#999"} strokeWidth={1.5} />
            <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} stroke={hasError ? "#d33" : "#999"} strokeWidth={1.5} />
          </g>
        );
      }
    }
  }

  // Interaction targets
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gridX + c * CELL_SIZE;
        const y = gridY + r * CELL_SIZE;
        targets.push(
          <rect
            key={`t-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag(r, c, e.button === 2);
            }}
            onMouseEnter={() => continueDrag(r, c)}
            onContextMenu={(e) => e.preventDefault()}
          />
        );
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {elements}
          {targets}
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
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
