import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TilePaintCanon } from "../types/canon";
import { ROOM_SHADE, ON_ROOM_SHADE_TEXT } from "./boardColors";
import {
  SHADED,
  MARKED,
  UNSET,
  computeTiles,
  validateTilePaint,
  brokenClues,
  hasWallBelow,
  hasWallRight,
  pictureOrigin,
} from "./tilePaintRules";

interface TilePaintBoardProps {
  canon: TilePaintCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const TILE_PAINT_CELL = 32;
export const TILE_PAINT_PAD = 12;
const CELL = TILE_PAINT_CELL;
const PAD = TILE_PAINT_PAD;
const THIN = 1;
const THICK = 3;
const THUMB_BG = "#d9d9d9";
const ERROR = "#d32f2f";

/** Grid lines (thick walls, thin otherwise) and clue cells; shared with the editor. */
export function TilePaintGrid({
  canon,
  broken,
  highlight,
}: {
  canon: TilePaintCanon;
  broken?: Set<string> | null;
  highlight?: Set<string>;
}) {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const lines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const thick = r === 0 || r === rows || hasWallBelow(canon, r - 1, c);
      lines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL}
          y1={r * CELL}
          x2={(c + 1) * CELL}
          y2={r * CELL}
          stroke="black"
          strokeWidth={thick ? THICK : THIN}
          strokeLinecap="square"
        />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const thick = c === 0 || c === cols || hasWallRight(canon, r, c - 1);
      lines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL}
          y1={r * CELL}
          x2={c * CELL}
          y2={(r + 1) * CELL}
          stroke="black"
          strokeWidth={thick ? THICK : THIN}
          strokeLinecap="square"
        />
      );
    }
  }
  const clues: JSX.Element[] = [];
  canon.cells.forEach((row, r) =>
    row.forEach((clue, c) => {
      if (!clue) return;
      const x = c * CELL;
      const y = r * CELL;
      const blank = clue.right === null && clue.down === null;
      if (highlight?.has(`${r},${c}`)) {
        clues.push(<rect key={`hl-${r}-${c}`} x={x} y={y} width={CELL} height={CELL} fill="#fff3c4" />);
      }
      if (!blank) {
        clues.push(
          <line key={`d-${r}-${c}`} x1={x} y1={y} x2={x + CELL} y2={y + CELL} stroke="black" strokeWidth={THIN} />
        );
      }
      const num = (dir: "right" | "down", value: number | null) => {
        if (value === null) return;
        const big = String(value).length > 1;
        clues.push(
          <text
            key={`${dir}-${r}-${c}`}
            x={dir === "right" ? x + CELL * 0.72 : x + CELL * 0.28}
            y={dir === "right" ? y + CELL * 0.3 : y + CELL * 0.72}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL * (big ? 0.34 : 0.4)}
            fontFamily="sans-serif"
            fill={broken?.has(`${r},${c},${dir}`) ? ERROR : "black"}
            fontWeight={broken?.has(`${r},${c},${dir}`) ? "bold" : "normal"}
            pointerEvents="none"
          >
            {value}
          </text>
        );
      };
      num("right", clue.right);
      num("down", clue.down);
    })
  );
  return (
    <>
      {clues}
      {lines}
    </>
  );
}

export default function TilePaintBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: TilePaintBoardProps) {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const tiles = useMemo(() => computeTiles(canon), [canon]);

  // State per tile; a tile takes the state of its first cell found in the saved values.
  const initialTileStates = useMemo(() => {
    const states: Record<number, number> = {};
    for (const [key, val] of Object.entries(initialUserValues ?? {})) {
      const [c, r] = key.split(",").map(Number);
      const id = tiles.ids[r]?.[c] ?? -1;
      if (id >= 0 && (val === SHADED || val === MARKED) && states[id] === undefined) states[id] = val;
    }
    return states;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tileStates, setTileStates] = useState<Record<number, number>>(initialTileStates);
  const completedRef = useRef(false);

  const states = useMemo(
    () => tiles.ids.map((row) => row.map((id) => (id >= 0 ? tileStates[id] ?? UNSET : UNSET))),
    [tiles, tileStates]
  );

  useEffect(() => {
    const values: Record<string, number> = {};
    states.forEach((row, r) =>
      row.forEach((s, c) => {
        if (s !== UNSET) values[`${c},${r}`] = s;
      })
    );
    onValuesChange?.(values);
  }, [states, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateTilePaint(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left click cycles the tile forward: unset -> shaded -> marked -> unset. Right click back.
  const cycle = useCallback(
    (r: number, c: number, dir: number) => {
      if (readonly) return;
      const id = tiles.ids[r][c];
      if (id < 0) return;
      setTileStates((prev) => {
        const next = ((prev[id] ?? UNSET) + dir + 3) % 3;
        const out = { ...prev };
        if (next === UNSET) delete out[id];
        else out[id] = next;
        return out;
      });
    },
    [readonly, tiles]
  );

  const broken = useMemo(() => (liveValidate ? brokenClues(canon, states) : null), [liveValidate, canon, states]);

  // Preview of the picture: the board without the clue strips; shaded black, marked
  // white, undecided gray, inner clue cells white.
  const { r0, c0 } = pictureOrigin(canon);
  const pRows = rows - r0;
  const pCols = cols - c0;
  const THUMB_MAX = 160;
  const thumbCell = Math.max(3, Math.min(8, Math.floor(THUMB_MAX / pCols), Math.floor(THUMB_MAX / pRows)));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {!readonly && (
        <svg
          width={thumbCell * pCols}
          height={thumbCell * pRows}
          viewBox={`0 0 ${thumbCell * pCols} ${thumbCell * pRows}`}
          style={{ border: "1px solid #aaa", background: THUMB_BG, display: "block" }}
          shapeRendering="crispEdges"
        >
          {states.slice(r0).flatMap((row, i) =>
            row.slice(c0).map((s, j) => {
              const clue = canon.cells[i + r0][j + c0] !== null;
              if (!clue && s === UNSET) return null;
              return (
                <rect
                  key={`tc-${i}-${j}`}
                  x={j * thumbCell}
                  y={i * thumbCell}
                  width={thumbCell}
                  height={thumbCell}
                  fill={s === SHADED ? "#000" : "#fff"}
                />
              );
            })
          )}
        </svg>
      )}
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {states.flatMap((row, r) =>
              row.map((s, c) => (
                <rect
                  key={`fill-${r}-${c}`}
                  x={c * CELL}
                  y={r * CELL}
                  width={CELL}
                  height={CELL}
                  fill={s === SHADED ? ROOM_SHADE : "white"}
                />
              ))
            )}
            {states.flatMap((row, r) =>
              row.map((s, c) =>
                s === MARKED ? (
                  <circle
                    key={`dot-${r}-${c}`}
                    cx={c * CELL + CELL / 2}
                    cy={r * CELL + CELL / 2}
                    r={3.5}
                    fill={ON_ROOM_SHADE_TEXT}
                    pointerEvents="none"
                  />
                ) : null
              )
            )}
            <TilePaintGrid canon={canon} broken={broken} />
            {!readonly &&
              states.flatMap((row, r) =>
                row.map((_, c) =>
                  tiles.ids[r][c] >= 0 ? (
                    <rect
                      key={`click-${r}-${c}`}
                      x={c * CELL}
                      y={r * CELL}
                      width={CELL}
                      height={CELL}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onClick={() => cycle(r, c, 1)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        cycle(r, c, -1);
                      }}
                    />
                  ) : null
                )
              )}
          </g>
        </svg>
      </div>
    </div>
  );
}
