import { useState, useEffect, useMemo, useRef } from "react";
import { SkeletonPuzzleCanon, SkeletonPuzzleAnswer } from "../types/canon";
import {
  Slot, boardGrid, candidates, findSlots, isCell, isSolved, placementsToAnswer, slotsAt,
} from "./skeletonPuzzleRules";

interface SkeletonPuzzleBoardProps {
  canon: SkeletonPuzzleCanon;
  initialAnswer?: SkeletonPuzzleAnswer | null;
  onAnswerChange?: (answer: SkeletonPuzzleAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL = 32;
const PAD = 8;
const INK = "#222";
const THIN = "#888";
const SELECT_FILL = "#dde8ff";

/** slot index -> word index from a saved answer, matching slots by start cell and direction. */
function placedFromAnswer(slots: Slot[], answer: SkeletonPuzzleAnswer | null | undefined, wordCount: number): Map<number, number> {
  const placed = new Map<number, number>();
  for (const p of answer?.placements ?? []) {
    const slot = slots.find((s) => s.r === p.r && s.c === p.c && s.dir === p.dir);
    if (slot && p.word >= 0 && p.word < wordCount) placed.set(slot.index, p.word);
  }
  return placed;
}

/**
 * Skeleton Puzzle (type 35). Tap a cell to select a slot through it (across first; tap
 * again to switch to down), then pick a word from the picker: it lists only unused words
 * of the slot's length that agree with the kana already there, so placements never
 * clash. The word list below the board is grouped by length with placed words struck.
 */
export default function SkeletonPuzzleBoard({ canon, initialAnswer, onAnswerChange, onComplete, readonly }: SkeletonPuzzleBoardProps) {
  const { cells, words } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const slots = useMemo(() => findSlots(cells), [cells]);
  const [placed, setPlaced] = useState<Map<number, number>>(() => placedFromAnswer(slots, initialAnswer, words.length));
  const [selected, setSelected] = useState<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    onAnswerChange?.({ placements: placementsToAnswer(slots, placed) });
  }, [placed, slots, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (isSolved(canon, slots, placed)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [placed, slots, canon, onComplete]);

  const grid = useMemo(() => boardGrid(canon, slots, placed), [canon, slots, placed]);
  const used = useMemo(() => new Set(placed.values()), [placed]);
  const slot = selected !== null ? slots[selected] : null;
  const picks = useMemo(() => (slot ? candidates(canon, slots, placed, slot) : []), [canon, slots, placed, slot]);

  const tapCell = (r: number, c: number) => {
    if (readonly || !isCell(cells, r, c)) return;
    const through = slotsAt(slots, r, c);
    if (through.length === 0) return;
    const at = through.findIndex((s) => s.index === selected);
    setSelected(through[at === -1 ? 0 : (at + 1) % through.length].index);
  };

  const place = (word: number | null) => {
    if (selected === null) return;
    setPlaced((prev) => {
      const next = new Map(prev);
      if (word === null) next.delete(selected);
      else next.set(selected, word);
      return next;
    });
  };

  const inSlot = new Set(slot?.cells.map(([r, c]) => `${r},${c}`) ?? []);
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  // One line per cell edge: thin between two cells, thick on the outline.
  const edges: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const above = isCell(cells, r - 1, c);
      const below = isCell(cells, r, c);
      if (!above && !below) continue;
      const thick = above !== below;
      edges.push(<line key={`h${r},${c}`} x1={c * CELL} y1={r * CELL} x2={(c + 1) * CELL} y2={r * CELL}
        stroke={thick ? INK : THIN} strokeWidth={thick ? 2.2 : 0.8} strokeLinecap="square" />);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const left = isCell(cells, r, c - 1);
      const right = isCell(cells, r, c);
      if (!left && !right) continue;
      const thick = left !== right;
      edges.push(<line key={`v${r},${c}`} x1={c * CELL} y1={r * CELL} x2={c * CELL} y2={(r + 1) * CELL}
        stroke={thick ? INK : THIN} strokeWidth={thick ? 2.2 : 0.8} strokeLinecap="square" />);
    }
  }

  // The word list grouped by length, like the print.
  const groups = new Map<number, number[]>();
  words.forEach((w, i) => {
    const len = [...w.word].length;
    groups.set(len, [...(groups.get(len) ?? []), i]);
  });
  const lengths = [...groups.keys()].sort((a, b) => a - b);

  const chip = (i: number) => (
    <button
      key={`pick-${i}`}
      onClick={() => place(i)}
      style={{ padding: "0.25rem 0.6rem", border: "1px solid #4a90d9", borderRadius: 4, background: "white", cursor: "pointer", fontSize: "0.95rem" }}
    >
      {words[i].word}
    </button>
  );

  return (
    <div style={{ width: "100%", maxWidth: Math.max(svgWidth, 320) }}>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: "block", userSelect: "none", maxWidth: svgWidth }}>
        <g transform={`translate(${PAD},${PAD})`}>
          {cells.flatMap((row, r) =>
            row.map((v, c) =>
              v === 1 ? (
                <g key={`c${r},${c}`} onClick={() => tapCell(r, c)} style={{ cursor: readonly ? "default" : "pointer" }}>
                  <rect x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={inSlot.has(`${r},${c}`) ? SELECT_FILL : "white"} />
                  {grid[r][c] && (
                    <text x={(c + 0.5) * CELL} y={(r + 0.5) * CELL} textAnchor="middle" dominantBaseline="central"
                      fontSize={CELL * 0.62} fill="black" pointerEvents="none">
                      {grid[r][c]}
                    </text>
                  )}
                </g>
              ) : null
            )
          )}
          {(canon.marks ?? []).map((m) => (
            <g key={`m${m.r},${m.c}`} pointerEvents="none">
              <rect x={m.c * CELL + 3} y={m.r * CELL + 3} width={CELL - 6} height={CELL - 6} fill="none" stroke={INK} strokeWidth={1} />
              <text x={(m.c + 1) * CELL - 2} y={(m.r + 1) * CELL - 2} textAnchor="end" fontSize={CELL * 0.3} fill={INK}>{m.label}</text>
            </g>
          ))}
          {edges}
        </g>
      </svg>

      {!readonly && (
        <div style={{ margin: "0.75rem 0", minHeight: "2.5rem" }}>
          {slot ? (
            <>
              <div style={{ fontSize: "0.85rem", color: "#555", marginBottom: "0.4rem" }}>
                {slot.length} letters {slot.dir === "across" ? "across" : "down"} from R{slot.r + 1}C{slot.c + 1}
                {placed.has(slot.index) ? ` · holds ${words[placed.get(slot.index)!].word}` : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {picks.filter((i) => i !== placed.get(slot.index)).map(chip)}
                {picks.length === 0 && !placed.has(slot.index) && (
                  <span style={{ fontSize: "0.85rem", color: "#888" }}>No unused word fits here.</span>
                )}
                {placed.has(slot.index) && (
                  <button onClick={() => place(null)} style={{ padding: "0.25rem 0.6rem", border: "1px solid #c33", color: "#c33", borderRadius: 4, background: "white", cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "#888" }}>Tap a cell to pick a word for its slot; tap again to switch across/down.</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem 1.5rem", marginTop: "0.5rem" }}>
        {lengths.map((len) => (
          <div key={`g${len}`} style={{ minWidth: 120 }}>
            <div style={{ fontWeight: "bold", borderBottom: "1px solid #999", marginBottom: "0.25rem" }}>{len}文字</div>
            {groups.get(len)!.map((i) => (
              <div key={`w${i}`} style={{ textDecoration: used.has(i) ? "line-through" : "none", color: used.has(i) ? "#999" : "black" }}>
                {words[i].word}
                {words[i].hint && <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: "0.3rem" }}>({words[i].hint})</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
