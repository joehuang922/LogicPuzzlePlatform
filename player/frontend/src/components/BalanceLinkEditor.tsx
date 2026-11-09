import { useState, useMemo, useCallback, useEffect } from "react";
import { BalanceLinkCanon } from "../types/canon";
import { BLACK, EMPTY, SHAPES, isSymbol, symbolCode, symbolIsBlack, symbolShape } from "./balanceLinkRules";
import { BalanceSymbol } from "./balanceLinkSymbols";

interface BalanceLinkEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;

function parseCanon(json: string): BalanceLinkCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed.cells) && parsed.cells.length > 0 && Array.isArray(parsed.cells[0])) {
      return parsed as BalanceLinkCanon;
    }
  } catch {}
  return null;
}

/** Overridable misread warnings: symbols that can't all be paired, or none at all. */
export function balanceLinkWarnings(canon: BalanceLinkCanon): string[] {
  const counts = new Map<number, number>();
  for (const row of canon.cells) for (const v of row) if (isSymbol(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (counts.size === 0) return ["No symbols"];
  const warnings: string[] = [];
  for (const [code, n] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (n % 2 === 1) {
      const shape = SHAPES.find((s) => s.id === symbolShape(code))?.name ?? `shape ${symbolShape(code)}`;
      warnings.push(`${symbolIsBlack(code) ? "Black" : "White"} ${shape.toLowerCase()} appears ${n} times, so one can't be paired`);
    }
  }
  return warnings;
}

export default function BalanceLinkEditor({ initialJson, onChange }: BalanceLinkEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  // Colour applied when a shape is picked.
  const [blackSymbol, setBlackSymbol] = useState(false);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((next: BalanceLinkCanon) => {
    setJsonText(JSON.stringify(next));
  }, []);

  const setCell = (value: number) => {
    if (!canon || !selected) return;
    const [r, c] = selected;
    const cells = canon.cells.map((row) => [...row]);
    cells[r][c] = value;
    updateJson({ cells });
  };

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 1 || newC < 1) return;
      const cells = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : EMPTY))
      );
      updateJson({ cells });
      setSelected(null);
    },
    [canon, rows, cols, updateJson]
  );

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid balance link JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && updateJson({ cells: Array.from({ length: newRows }, () => Array(newCols).fill(EMPTY)) })}>
            Create Empty Board
          </button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;
  const warnings = balanceLinkWarnings(canon);
  const selValue = selected ? canon.cells[selected[0]]?.[selected[1]] : undefined;

  const button = (label: React.ReactNode, active: boolean, onClick: () => void, key?: string) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        padding: "0.2rem 0.5rem",
        fontSize: "0.8rem",
        border: "1px solid #4a90d9",
        borderRadius: 4,
        background: active ? "#4a90d9" : "white",
        color: active ? "white" : "#222",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={rows} min={1}
            onChange={(e) => handleResize(Number(e.target.value), cols)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={cols} min={1}
            onChange={(e) => handleResize(rows, Number(e.target.value))}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>Click a cell, then pick what it holds</div>
      </div>

      {warnings.length > 0 && (
        <ul style={{ color: "#c33", fontSize: "0.8rem", margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <svg
          width={Math.min(svgWidth, 600)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {canon.cells.flatMap((row, r) =>
              row.map((v, c) => {
                const isSel = selected?.[0] === r && selected?.[1] === c;
                return (
                  <g
                    key={`cell-${r}-${c}`}
                    onClick={() => {
                      setSelected(isSel ? null : [r, c]);
                      if (!isSel && isSymbol(v)) setBlackSymbol(symbolIsBlack(v));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <rect x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE}
                      fill={v === BLACK ? "#333" : isSel ? "#e0e8ff" : "white"} stroke="#bbb" strokeWidth={0.5} strokeDasharray="4 3" />
                    {isSymbol(v) && <BalanceSymbol code={v} cx={(c + 0.5) * CELL_SIZE} cy={(r + 0.5) * CELL_SIZE} r={CELL_SIZE * 0.3} />}
                    {isSel && v === BLACK && (
                      <rect x={c * CELL_SIZE + 2} y={r * CELL_SIZE + 2} width={CELL_SIZE - 4} height={CELL_SIZE - 4}
                        fill="none" stroke="#4a90d9" strokeWidth={2} pointerEvents="none" />
                    )}
                  </g>
                );
              })
            )}
            <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE} fill="none" stroke="#222" strokeWidth={2} pointerEvents="none" />
          </g>
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 220 }}>
          {selected && selValue !== undefined ? (
            <>
              <strong style={{ fontSize: "0.85rem" }}>Row {selected[0] + 1}, column {selected[1] + 1}</strong>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {button("Empty", selValue === EMPTY, () => setCell(EMPTY))}
                {button("Black cell", selValue === BLACK, () => setCell(BLACK))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {button("White symbol", !blackSymbol, () => {
                  setBlackSymbol(false);
                  if (isSymbol(selValue)) setCell(symbolCode(symbolShape(selValue), false));
                })}
                {button("Black symbol", blackSymbol, () => {
                  setBlackSymbol(true);
                  if (isSymbol(selValue)) setCell(symbolCode(symbolShape(selValue), true));
                })}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {SHAPES.map((s) => {
                  const code = symbolCode(s.id, blackSymbol);
                  return button(
                    <>
                      <svg width={18} height={18} viewBox="0 0 18 18"><BalanceSymbol code={code} cx={9} cy={9} r={7} /></svg>
                      {s.name}
                    </>,
                    selValue === code,
                    () => setCell(code),
                    `shape-${s.id}`
                  );
                })}
              </div>
            </>
          ) : (
            <span style={{ fontSize: "0.8rem", color: "#666" }}>Click a cell to edit it.</span>
          )}
        </div>
      </div>
    </div>
  );
}
