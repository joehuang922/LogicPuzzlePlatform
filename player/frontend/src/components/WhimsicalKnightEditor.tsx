import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { WhimsicalKnightCanon } from "../types/canon";
import { WhimsicalKnightClues, WhimsicalKnightDots, WK_PAD, WK_SPACING as S } from "./WhimsicalKnightBoard";
import { whimsicalKnightFormatProblems } from "./whimsicalKnightRules";

interface WhimsicalKnightEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

function parseCanon(json: string): WhimsicalKnightCanon | null {
  try {
    const p = JSON.parse(json);
    if (typeof p.rows === "number" && typeof p.cols === "number" && p.rows >= 2 && p.cols >= 2) {
      return {
        rows: p.rows,
        cols: p.cols,
        gray: Array.isArray(p.gray) ? p.gray : [],
        circles: Array.isArray(p.circles) ? p.circles : [],
        squares: Array.isArray(p.squares) ? p.squares : [],
      };
    }
  } catch {}
  return null;
}

function makeEmptyCanon(rows: number, cols: number): WhimsicalKnightCanon {
  return {
    rows,
    cols,
    gray: Array.from({ length: rows - 1 }, () => Array<number>(cols - 1).fill(0)),
    circles: [],
    squares: [],
  };
}

// Click a cell to toggle its gray square; click near a dot or midpoint to cycle its clue
// (dot: none -> circle -> square -> none; midpoint: none -> circle -> none).
export default function WhimsicalKnightEditor({ initialJson, onChange }: WhimsicalKnightEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon?.rows ?? 0;
  const cols = canon?.cols ?? 0;
  const svgWidth = (cols - 1) * S + WK_PAD * 2;
  const svgHeight = (rows - 1) * S + WK_PAD * 2;

  const updateJson = useCallback((next: WhimsicalKnightCanon) => {
    setJsonText(JSON.stringify(next));
  }, []);

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!canon) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    // Doubled coordinates of the click: dots at even, cell centres at odd/odd.
    const fr = (((e.clientY - rect.top) * scale - WK_PAD) / S) * 2;
    const fc = (((e.clientX - rect.left) * scale - WK_PAD) / S) * 2;
    const dr = Math.round(fr);
    const dc = Math.round(fc);
    if (dr < 0 || dc < 0 || dr > 2 * (rows - 1) || dc > 2 * (cols - 1)) return;

    if (dr % 2 === 1 && dc % 2 === 1) {
      const r = (dr - 1) / 2;
      const c = (dc - 1) / 2;
      const gray = canon.gray.map((row) => [...row]);
      if (gray[r]?.[c] === undefined) return;
      gray[r][c] = gray[r][c] === 1 ? 0 : 1;
      updateJson({ ...canon, gray });
      return;
    }

    const at = (p: { dr: number; dc: number }) => p.dr === dr && p.dc === dc;
    const onDot = dr % 2 === 0 && dc % 2 === 0;
    const circles = canon.circles.filter((p) => !at(p));
    const squares = canon.squares.filter((p) => !at(p));
    if (canon.circles.some(at)) {
      if (onDot) squares.push({ dr, dc }); // circle -> square on a dot, -> none on a midpoint
    } else if (!canon.squares.some(at)) {
      circles.push({ dr, dc });
    }
    const order = (a: { dr: number; dc: number }, b: { dr: number; dc: number }) => a.dr - b.dr || a.dc - b.dc;
    updateJson({ ...canon, circles: circles.sort(order), squares: squares.sort(order) });
  };

  const handleResize = (newRows: number, newCols: number) => {
    if (!canon || newRows < 2 || newCols < 2) return;
    const fits = (p: { dr: number; dc: number }) => p.dr <= 2 * (newRows - 1) && p.dc <= 2 * (newCols - 1);
    updateJson({
      rows: newRows,
      cols: newCols,
      gray: Array.from({ length: newRows - 1 }, (_, r) =>
        Array.from({ length: newCols - 1 }, (_, c) => canon.gray[r]?.[c] ?? 0)
      ),
      circles: canon.circles.filter(fits),
      squares: canon.squares.filter(fits),
    });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid whimsical knight JSON. Fix the textarea or create a new lattice.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(6, 6))}>Create 6x6 dots</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = whimsicalKnightFormatProblems(canon);
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
          Click a cell to toggle gray · click a dot to cycle circle → square · click between two dots for a circle
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

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white", cursor: "pointer" }}
        onClick={onClick}
      >
        <g transform={`translate(${WK_PAD},${WK_PAD})`}>
          <WhimsicalKnightClues canon={canon} />
          <WhimsicalKnightDots rows={rows} cols={cols} />
        </g>
      </svg>
      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
        <strong>Circles:</strong> {canon.circles.length} · <strong>Squares:</strong> {canon.squares.length} ·{" "}
        <strong>Gray:</strong> {canon.gray.flat().filter((g) => g === 1).length}
      </div>
    </div>
  );
}
