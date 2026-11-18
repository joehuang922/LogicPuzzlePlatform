import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { OminoTreeArrow, OminoTreeCanon, OminoTreeDir } from "../types/canon";
import { OminoTreeClues, OminoTreeGrid, OT_CELL as S, OT_PAD } from "./OminoTreeBoard";
import { arrowEdgeKey, ominoTreeFormatProblems } from "./ominoTreeRules";

interface OminoTreeEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const DIRS: OminoTreeDir[] = ["up", "down", "left", "right"];

function parseCanon(json: string): OminoTreeCanon | null {
  try {
    const p = JSON.parse(json);
    if (typeof p.rows === "number" && typeof p.cols === "number" && p.rows >= 2 && p.cols >= 2) {
      return {
        rows: p.rows,
        cols: p.cols,
        numbers: Array.isArray(p.numbers) ? p.numbers : [],
        arrows: Array.isArray(p.arrows)
          ? p.arrows.filter(
              (a: OminoTreeArrow) => typeof a?.r === "number" && typeof a?.c === "number" && DIRS.includes(a?.dir)
            )
          : [],
      };
    }
  } catch {}
  return null;
}

function makeEmptyCanon(rows: number, cols: number): OminoTreeCanon {
  return { rows, cols, numbers: Array.from({ length: rows }, () => Array<number>(cols).fill(0)), arrows: [] };
}

const sortArrows = (arrows: OminoTreeArrow[]) =>
  [...arrows].sort((a, b) => a.r - b.r || a.c - b.c || a.dir.localeCompare(b.dir));

// Fraction of a cell from a line within which a click edits that edge's arrow.
const EDGE_ZONE = 0.25;

/**
 * Click a cell's middle to set its number; click near an interior edge to cycle its
 * arrow: none -> right/down -> left/up -> none.
 */
export default function OminoTreeEditor({ initialJson, onChange }: OminoTreeEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon?.rows ?? 0;
  const cols = canon?.cols ?? 0;
  const svgWidth = cols * S + OT_PAD * 2;
  const svgHeight = rows * S + OT_PAD * 2;

  const updateJson = useCallback((next: OminoTreeCanon) => {
    setJsonText(JSON.stringify(next));
  }, []);

  const cycleArrow = (forward: OminoTreeArrow, backward: OminoTreeArrow) => {
    if (!canon) return;
    const key = arrowEdgeKey(forward);
    const current = canon.arrows.find((a) => arrowEdgeKey(a) === key);
    const others = canon.arrows.filter((a) => arrowEdgeKey(a) !== key);
    let next: OminoTreeArrow | null = forward;
    if (current && current.dir === forward.dir && current.r === forward.r && current.c === forward.c) next = backward;
    else if (current) next = null;
    updateJson({ ...canon, arrows: sortArrows(next ? [...others, next] : others) });
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!canon) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const fy = ((e.clientY - rect.top) * scale - OT_PAD) / S;
    const fx = ((e.clientX - rect.left) * scale - OT_PAD) / S;
    if (fx < 0 || fy < 0 || fx >= cols || fy >= rows) return;
    const r = Math.floor(fy);
    const c = Math.floor(fx);
    const lineR = Math.round(fy);
    const lineC = Math.round(fx);
    const dy = Math.abs(fy - lineR);
    const dx = Math.abs(fx - lineC);
    const nearH = dy < EDGE_ZONE && lineR > 0 && lineR < rows;
    const nearV = dx < EDGE_ZONE && lineC > 0 && lineC < cols;
    if (nearH && (!nearV || dy <= dx)) {
      cycleArrow({ r: lineR - 1, c, dir: "down" }, { r: lineR, c, dir: "up" });
      return;
    }
    if (nearV) {
      cycleArrow({ r, c: lineC - 1, dir: "right" }, { r, c: lineC, dir: "left" });
      return;
    }
    const current = canon.numbers[r]?.[c] ?? 0;
    const input = window.prompt(`Number for (${r},${c}) (empty or 0 clears)`, current ? String(current) : "");
    if (input === null) return;
    const n = Math.max(0, Math.floor(Number(input.trim() || "0")));
    if (!Number.isFinite(n)) return;
    const numbers = Array.from({ length: rows }, (_, rr) =>
      Array.from({ length: cols }, (_, cc) => canon.numbers[rr]?.[cc] ?? 0)
    );
    numbers[r][c] = n;
    updateJson({ ...canon, numbers });
  };

  const handleResize = (newRows: number, newCols: number) => {
    if (!canon || newRows < 2 || newCols < 2) return;
    const inside = (r: number, c: number) => r >= 0 && r < newRows && c >= 0 && c < newCols;
    const step = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] } as const;
    updateJson({
      rows: newRows,
      cols: newCols,
      numbers: Array.from({ length: newRows }, (_, r) =>
        Array.from({ length: newCols }, (_, c) => canon.numbers[r]?.[c] ?? 0)
      ),
      arrows: canon.arrows.filter((a) => inside(a.r, a.c) && inside(a.r + step[a.dir][0], a.c + step[a.dir][1])),
    });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid omino tree JSON. Fix the textarea or create a new grid.</p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(6, 6))}>Create 6x6</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = ominoTreeFormatProblems(canon);
  const inputStyle = { width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 };

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={rows} min={2}
            onChange={(e) => handleResize(Number(e.target.value), cols)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={cols} min={2}
            onChange={(e) => handleResize(rows, Number(e.target.value))} style={inputStyle} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a cell to set its number · click an edge to cycle its arrow (→/↓, ←/↑, none)
        </div>
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {problems.length === 0 && canon.arrows.length === 0 && (
        <div style={{ color: "#a60", fontSize: "0.8rem", marginBottom: "0.75rem" }}>Warning: no arrows.</div>
      )}

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white", cursor: "pointer" }}
        onClick={onClick}
      >
        <g transform={`translate(${OT_PAD},${OT_PAD})`}>
          <OminoTreeClues canon={canon} />
          <OminoTreeGrid rows={rows} cols={cols} />
        </g>
      </svg>
      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
        <strong>Numbers:</strong> {canon.numbers.flat().filter((n) => n > 0).length} · <strong>Arrows:</strong>{" "}
        {canon.arrows.length}
      </div>
    </div>
  );
}
