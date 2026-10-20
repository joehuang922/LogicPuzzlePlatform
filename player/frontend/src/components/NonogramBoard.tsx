import { useState, useEffect, useCallback, useRef } from "react";
import { nextHint, nonogramRevealStep, Step } from "@puzzle/solver";
import { NonogramCanon, NonogramAnswer } from "../types/canon";
import { analyzeLineStatus, getColLine, ClueStatus, CellState } from "../liveValidators/nonogram";

interface NonogramBoardProps {
  canon: NonogramCanon;
  initialAnswer?: NonogramAnswer | null;
  onAnswerChange?: (answer: NonogramAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
  // The gate-computed solution grid (0/1), when stored. Backs the "reveal" hint
  // fallback and the check that a hint doesn't build on a mistaken mark.
  solution?: number[][] | null;
}

// The hint affordance's view model: a step (with its settled cells shown or not), or a
// plain message.
type HintView = { kind: "step"; step: Step; showCells: boolean } | { kind: "message"; text: string };

const TECHNIQUE_LABELS: Record<string, string> = {
  "line-contradiction": "A line doesn't fit its clue",
  "line-complete": "Finish a line",
  "line-overlap": "Overlapping blocks",
  "line-empties": "Cells no block can reach",
  "two-lines": "Where a row meets a column",
  "inconsistent-marks": "Conflicting marks",
  reveal: "Revealed cell",
};

const HINT_LINE_FILL = "rgba(255,193,7,0.3)";
const HINT_CELL_COLOR = "#1976d2";

const CELL_SIZE = 21;
const PAD = 8;

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

export default function NonogramBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
  liveValidate,
  solution,
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
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [showHighlight, setShowHighlight] = useState(true);
  const [showCoords, setShowCoords] = useState(true);

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

  // --- Hint affordance (docs/auto-solve) ---------------------------------------
  // Runs the client-side line solver on the player's marks and points at the next line
  // (row or column) whose clue settles something; the settled cells stay hidden until
  // asked for. Falls back to revealing one cell from the stored solution.
  const [hint, setHint] = useState<HintView | null>(null);

  const requestHint = useCallback(() => {
    if (validateSolution(rowClues, colClues, cells)) {
      setHint({ kind: "message", text: "The puzzle is already solved." });
      return;
    }
    const values: Record<string, number> = {};
    cells.forEach((row, r) => row.forEach((v, c) => {
      if (v !== 0) values[`${c},${r}`] = v;
    }));
    const step = nextHint(6, canon, values) ?? nonogramRevealStep(canon, values, solution ?? null);
    if (!step) {
      setHint({ kind: "message", text: "No further hints are available for this puzzle." });
      return;
    }
    // Hints take the player's marks as correct, so a wrong mark can yield a "deduction"
    // that contradicts the real answer. Don't teach from it: flag the mistake instead.
    const wrong = solution && step.placements?.some(
      (p) => (solution[Math.floor(p.cell / cols)]?.[p.cell % cols] === 1 ? 1 : 2) !== p.value
    );
    if (wrong) {
      setHint({
        kind: "message",
        text: "Your marks so far lead to a deduction that doesn't match the solution — one of them is a mistake. Check your recent marks.",
      });
      return;
    }
    setHint({ kind: "step", step, showCells: false });
  }, [cells, canon, rowClues, colClues, cols, solution]);

  // Commit the cells the hinted step settles, then dismiss it.
  const applyHint = useCallback(() => {
    if (hint?.kind !== "step" || !hint.step.placements) return;
    const placements = hint.step.placements;
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      for (const p of placements) next[Math.floor(p.cell / cols)][p.cell % cols] = p.value as CellState;
      return next;
    });
    setHint(null);
  }, [hint, cols]);

  // A hint reflects a specific board; once the player changes it, drop the stale hint.
  const cellsAtHint = useRef(cells);
  useEffect(() => {
    if (hint && cells !== cellsAtHint.current) setHint(null);
    cellsAtHint.current = cells;
  }, [cells, hint]);

  const MIN_THUMB_CELL = 2;
  const MAX_THUMB_CELL = 4;
  const THUMB_PAD = 4;

  const baseClueAreaWidth = maxRowClueLen * CELL_SIZE;
  const baseClueAreaHeight = maxColClueLen * CELL_SIZE;

  // Thumbnail cell size: fit within the clue corner, but at least MIN_THUMB_CELL
  const thumbFitW = Math.floor((baseClueAreaWidth - THUMB_PAD * 2) / cols);
  const thumbFitH = Math.floor((baseClueAreaHeight - THUMB_PAD * 2) / rows);
  const thumbCell = Math.max(MIN_THUMB_CELL, Math.min(MAX_THUMB_CELL, thumbFitW, thumbFitH));

  // If thumbnail overflows, expand clue areas
  const thumbTotalW = thumbCell * cols + THUMB_PAD * 2;
  const thumbTotalH = thumbCell * rows + THUMB_PAD * 2;
  const clueAreaWidth = Math.max(baseClueAreaWidth, thumbTotalW);
  const clueAreaHeight = Math.max(baseClueAreaHeight, thumbTotalH);

  const gridWidth = cols * CELL_SIZE;
  const gridHeight = rows * CELL_SIZE;
  const svgWidth = clueAreaWidth + gridWidth + PAD * 2;
  const svgHeight = clueAreaHeight + gridHeight + PAD * 2;

  const gridX = PAD + clueAreaWidth;
  const gridY = PAD + clueAreaHeight;

  const elements: JSX.Element[] = [];

  // Thumbnail preview in upper-left corner
  const thumbX = PAD + Math.floor((clueAreaWidth - thumbCell * cols) / 2);
  const thumbY = PAD + Math.floor((clueAreaHeight - thumbCell * rows) / 2);
  elements.push(
    <rect
      key="thumb-bg"
      x={thumbX}
      y={thumbY}
      width={thumbCell * cols}
      height={thumbCell * rows}
      fill="#fff"
      stroke="#ccc"
      strokeWidth={0.5}
    />
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === 1) {
        elements.push(
          <rect
            key={`th-${r}-${c}`}
            x={thumbX + c * thumbCell}
            y={thumbY + r * thumbCell}
            width={thumbCell}
            height={thumbCell}
            fill="#222"
          />
        );
      }
    }
  }

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

  // "satisfied" grey is a solving aid, always shown. The red "error" color is
  // gated behind the live-validator toggle.
  const clueColor = (status: ClueStatus) =>
    status === "satisfied" ? "#aaa" : status === "error" && liveValidate ? "#d33" : "#333";

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
      const hasError = liveValidate && (rowAnalyses[r].hasError || colAnalyses[c].hasError);
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

  // Hover highlight
  const highlights: JSX.Element[] = [];
  if (!readonly && showHighlight && hoverCell) {
    const { r, c } = hoverCell;
    // Row highlight: spans row clue area + grid
    highlights.push(
      <rect
        key="hl-row"
        x={PAD}
        y={gridY + r * CELL_SIZE}
        width={clueAreaWidth + gridWidth}
        height={CELL_SIZE}
        fill="rgba(173,216,230,0.35)"
        pointerEvents="none"
      />
    );
    // Column highlight: spans col clue area + grid
    highlights.push(
      <rect
        key="hl-col"
        x={gridX + c * CELL_SIZE}
        y={PAD}
        width={CELL_SIZE}
        height={clueAreaHeight + gridHeight}
        fill="rgba(173,216,230,0.35)"
        pointerEvents="none"
      />
    );
  }

  // Hint highlights: the focus lines (clue + grid, like the hover band), and the settled
  // cells once the player asks to see them.
  const hintMarks: JSX.Element[] = [];
  if (hint?.kind === "step") {
    for (const { axis, index } of hint.step.focusLines ?? []) {
      hintMarks.push(
        axis === "row" ? (
          <rect key={`hint-row-${index}`} x={PAD} y={gridY + index * CELL_SIZE} width={clueAreaWidth + gridWidth}
            height={CELL_SIZE} fill={HINT_LINE_FILL} stroke="#f9a825" strokeWidth={1.5} pointerEvents="none" />
        ) : (
          <rect key={`hint-col-${index}`} x={gridX + index * CELL_SIZE} y={PAD} width={CELL_SIZE}
            height={clueAreaHeight + gridHeight} fill={HINT_LINE_FILL} stroke="#f9a825" strokeWidth={1.5} pointerEvents="none" />
        )
      );
    }
    if (hint.showCells) {
      for (const { cell, value } of hint.step.placements ?? []) {
        const x = gridX + (cell % cols) * CELL_SIZE;
        const y = gridY + Math.floor(cell / cols) * CELL_SIZE;
        if (value === 1) {
          hintMarks.push(
            <rect key={`hint-cell-${cell}`} x={x + 3} y={y + 3} width={CELL_SIZE - 6} height={CELL_SIZE - 6}
              fill={HINT_CELL_COLOR} opacity={0.6} pointerEvents="none" />
          );
        } else {
          const cx = x + CELL_SIZE / 2;
          const cy = y + CELL_SIZE / 2;
          const s = CELL_SIZE * 0.25;
          hintMarks.push(
            <g key={`hint-cell-${cell}`} pointerEvents="none">
              <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} stroke={HINT_CELL_COLOR} strokeWidth={2} />
              <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} stroke={HINT_CELL_COLOR} strokeWidth={2} />
            </g>
          );
        }
      }
    }
  }

  // Coordinate tooltip
  const coordLabel: JSX.Element[] = [];
  if (!readonly && showCoords && hoverCell) {
    const { r, c } = hoverCell;
    const labelX = gridX + (c + 1) * CELL_SIZE + 3;
    const labelY = gridY + (r + 1) * CELL_SIZE + 3;
    const text = `${c + 1}, ${r + 1}`;
    coordLabel.push(
      <rect
        key="coord-bg"
        x={labelX}
        y={labelY}
        width={text.length * 5.5 + 6}
        height={12}
        rx={2}
        fill="rgba(0,0,0,0.7)"
        pointerEvents="none"
      />
    );
    coordLabel.push(
      <text
        key="coord-text"
        x={labelX + 3}
        y={labelY + 9}
        fontSize={9}
        fontFamily="monospace"
        fill="#fff"
        pointerEvents="none"
      >
        {text}
      </text>
    );
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
            onMouseEnter={() => { setHoverCell({ r, c }); continueDrag(r, c); }}
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
          onMouseLeave={() => setHoverCell(null)}
        >
          {elements}
          {highlights}
          {hintMarks}
          {targets}
          {coordLabel}
        </svg>
      </div>
      {!readonly && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
          <label style={{ fontSize: 12, marginLeft: 12, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={showHighlight}
              onChange={(e) => setShowHighlight(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Highlight
          </label>
          <label style={{ fontSize: 12, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={showCoords}
              onChange={(e) => setShowCoords(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Coords
          </label>
          <button
            onClick={requestHint}
            style={{ ...hintButtonStyle, marginLeft: 12, background: "#1976d2", color: "white", border: "none" }}
            title="Point at the next line worth a look"
          >
            Hint
          </button>
          {hint && (
            <button onClick={() => setHint(null)} style={hintButtonStyle}>
              Clear hint
            </button>
          )}
        </div>
      )}
      {!readonly && hint && (
        <div
          style={{
            maxWidth: 480,
            padding: "0.6rem 0.8rem",
            background: hint.kind === "message" ? "#fff8e1" : "#e3f2fd",
            border: `1px solid ${hint.kind === "message" ? "#ffe082" : "#90caf9"}`,
            borderRadius: 6,
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          {hint.kind === "step" && (
            <>
              <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>
                {TECHNIQUE_LABELS[hint.step.technique] ?? hint.step.technique}
              </div>
              <div style={{ color: "#333" }}>{hint.step.explanation}</div>
              {hint.step.placements && (
                <div style={{ display: "flex", gap: 8, marginTop: "0.5rem" }}>
                  {!hint.showCells && (
                    <button onClick={() => setHint({ ...hint, showCells: true })} style={hintButtonStyle}>
                      Show cells
                    </button>
                  )}
                  <button
                    onClick={applyHint}
                    style={{ ...hintButtonStyle, background: "#1976d2", color: "white", border: "none" }}
                  >
                    Fill them in
                  </button>
                </div>
              )}
            </>
          )}
          {hint.kind === "message" && <div style={{ color: "#333" }}>{hint.text}</div>}
        </div>
      )}
    </div>
  );
}

const hintButtonStyle = {
  fontSize: "0.8rem",
  padding: "0.3rem 0.8rem",
  background: "#f0f0f0",
  border: "1px solid #ccc",
  borderRadius: 4,
  cursor: "pointer",
};
