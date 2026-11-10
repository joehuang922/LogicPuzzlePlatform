import { useState, useEffect, useCallback, useRef } from "react";
import { DoubleChocoCanon, DoubleChocoAnswer } from "../types/canon";
import { validateSolution } from "./doubleChocoRules";

interface DoubleChocoBoardProps {
  canon: DoubleChocoCanon;
  initialAnswer?: DoubleChocoAnswer | null;
  onAnswerChange?: (answer: DoubleChocoAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

export default function DoubleChocoBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: DoubleChocoBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () => Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const emptyV = () => Array.from({ length: rows }, () => Array(cols - 1).fill(0));

  const [hGrids, setHGrids] = useState<number[][]>(initialAnswer?.grids?.h ?? emptyH());
  const [vGrids, setVGrids] = useState<number[][]>(initialAnswer?.grids?.v ?? emptyV());
  const completedRef = useRef(false);

  useEffect(() => {
    const answer: DoubleChocoAnswer = { grids: { h: hGrids, v: vGrids } };
    onAnswerChange?.(answer);
  }, [hGrids, vGrids, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    // Check if any thick edges exist before validating
    const hasAnyThick =
      hGrids.some((row) => row.some((v) => v === 1)) ||
      vGrids.some((row) => row.some((v) => v === 1));
    if (!hasAnyThick) return;

    if (validateSolution(cells, hGrids, vGrids)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hGrids, vGrids, cells, onComplete]);

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      setHGrids((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    []
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      setVGrids((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    []
  );

  const gridLines: JSX.Element[] = [];

  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && hGrids[r - 1][c] === 1);
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
          strokeDasharray={isThick ? undefined : "3,3"}
        />
      );
    }
  }

  // Vertical lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && vGrids[r][c - 1] === 1);
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
          strokeDasharray={isThick ? undefined : "3,3"}
        />
      );
    }
  }

  // Edge click targets
  const edgeTargets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_SIZE;
        const y = (r + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        edgeTargets.push(
          <rect
            key={`he-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={EDGE_HIT_WIDTH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleHEdgeClick(r, c)}
          />
        );
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const x = (c + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        const y = r * CELL_SIZE;
        edgeTargets.push(
          <rect
            key={`ve-${r}-${c}`}
            x={x}
            y={y}
            width={EDGE_HIT_WIDTH}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleVEdgeClick(r, c)}
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
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Cell fills */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const [color] = cells[r][c];
            return (
              <rect
                key={`fill-${r}-${c}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill={color === 1 ? "#ccc" : "white"}
              />
            );
          })}

          {/* Numbers */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const [, num] = cells[r][c];
            if (num === 0) return null;
            return (
              <text
                key={`num-${r}-${c}`}
                x={c * CELL_SIZE + CELL_SIZE / 2}
                y={r * CELL_SIZE + CELL_SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={CELL_SIZE * 0.5}
                fontFamily="sans-serif"
                fontWeight="bold"
                fill="black"
                pointerEvents="none"
              >
                {num}
              </text>
            );
          })}

          {gridLines}
          {edgeTargets}
        </g>
      </svg>
    </div>
  );
}
