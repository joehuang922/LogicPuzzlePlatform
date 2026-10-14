import { useState, useCallback, useRef, useEffect } from "react";

interface NonogramEditorProps {
  initialCanon?: string;
  onChange: (json: string) => void;
}

// Module-level (unlike ClueInput) so its identity survives the re-render that a
// focused clue input's blur-commit triggers mid-click; otherwise the click is lost.
function DeleteButton({ title, disabled, onClick }: { title: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{ marginLeft: 4, padding: "1px 3px", lineHeight: 0, verticalAlign: "middle", cursor: disabled ? "default" : "pointer" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

export default function NonogramEditor({ initialCanon, onChange }: NonogramEditorProps) {
  let initRowClues: number[][] = [[1], [1], [1], [1], [1]];
  let initColClues: number[][] = [[1], [1], [1], [1], [1]];

  if (initialCanon) {
    try {
      const parsed = JSON.parse(initialCanon);
      if (parsed.rowClues) initRowClues = parsed.rowClues;
      if (parsed.colClues) initColClues = parsed.colClues;
    } catch { /* ignore */ }
  }

  const [rowClues, setRowClues] = useState<number[][]>(initRowClues);
  const [colClues, setColClues] = useState<number[][]>(initColClues);
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify({ rowClues: initRowClues, colClues: initColClues }, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const rows = rowClues.length;
  const cols = colClues.length;

  const syncFromJson = useCallback((text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed.rowClues || !parsed.colClues) {
        setJsonError("Missing rowClues or colClues");
        return;
      }
      setRowClues(parsed.rowClues);
      setColClues(parsed.colClues);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, []);

  const syncToJson = useCallback((newRowClues: number[][], newColClues: number[][]) => {
    setRowClues(newRowClues);
    setColClues(newColClues);
    setJsonText(JSON.stringify({ rowClues: newRowClues, colClues: newColClues }, null, 2));
    setJsonError(null);
  }, []);

  function commitRowClue(r: number, value: string) {
    const nums = value
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0);
    const newRowClues = [...rowClues];
    newRowClues[r] = nums.length > 0 ? nums : [0];
    syncToJson(newRowClues, colClues);
  }

  function commitColClue(c: number, value: string) {
    const nums = value
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0);
    const newColClues = [...colClues];
    newColClues[c] = nums.length > 0 ? nums : [0];
    syncToJson(rowClues, newColClues);
  }

  function resizeRows(newRows: number) {
    if (newRows < 5) return;
    const rounded = Math.round(newRows / 5) * 5;
    const newRowClues = Array.from({ length: rounded }, (_, i) =>
      i < rowClues.length ? rowClues[i] : [0]
    );
    syncToJson(newRowClues, colClues);
  }

  function resizeCols(newCols: number) {
    if (newCols < 5) return;
    const rounded = Math.round(newCols / 5) * 5;
    const newColClues = Array.from({ length: rounded }, (_, i) =>
      i < colClues.length ? colClues[i] : [0]
    );
    syncToJson(rowClues, newColClues);
  }

  // Delete a single row/column (any count, not rounded to 5): a mitigation for the
  // parser occasionally emitting a phantom duplicate of a neighbouring line.
  function removeRow(r: number) {
    if (rowClues.length <= 1) return;
    syncToJson(rowClues.filter((_, i) => i !== r), colClues);
  }

  function removeCol(c: number) {
    if (colClues.length <= 1) return;
    syncToJson(rowClues, colClues.filter((_, i) => i !== c));
  }

  useEffect(() => {
    onChange(JSON.stringify({ rowClues, colClues }, null, 2));
  }, [rowClues, colClues, onChange]);

  function ClueInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
    const [local, setLocal] = useState(value);
    const prevValue = useRef(value);

    useEffect(() => {
      if (value !== prevValue.current) {
        setLocal(value);
        prevValue.current = value;
      }
    }, [value]);

    return (
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(local); }}
        style={{ width: 120, fontFamily: "monospace", fontSize: "0.85rem" }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Rows:{" "}
          <input
            type="number" onFocus={(e) => e.currentTarget.select()}
            min={5}
            step={5}
            value={rows}
            onChange={(e) => resizeRows(Number(e.target.value) || 5)}
            style={{ width: 50 }}
          />
        </label>
        <label>
          Cols:{" "}
          <input
            type="number" onFocus={(e) => e.currentTarget.select()}
            min={5}
            step={5}
            value={cols}
            onChange={(e) => resizeCols(Number(e.target.value) || 5)}
            style={{ width: 50 }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: "0 0 0.5rem" }}>Row Clues</h4>
          <p style={{ fontSize: "0.75rem", color: "#666", margin: "0 0 0.5rem" }}>
            Comma or space separated. Commits on blur or Enter.
          </p>
          {rowClues.map((clue, r) => (
            <div key={r} style={{ marginBottom: 4 }}>
              <label style={{ fontSize: "0.85rem" }}>
                R{r}:{" "}
                <ClueInput
                  value={clue.join(",")}
                  onCommit={(v) => commitRowClue(r, v)}
                />
              </label>
              <DeleteButton title={`Delete row R${r}`} disabled={rows <= 1} onClick={() => removeRow(r)} />
            </div>
          ))}
        </div>
        <div>
          <h4 style={{ margin: "0 0 0.5rem" }}>Column Clues</h4>
          <p style={{ fontSize: "0.75rem", color: "#666", margin: "0 0 0.5rem" }}>
            Comma or space separated. Commits on blur or Enter.
          </p>
          {colClues.map((clue, c) => (
            <div key={c} style={{ marginBottom: 4 }}>
              <label style={{ fontSize: "0.85rem" }}>
                C{c}:{" "}
                <ClueInput
                  value={clue.join(",")}
                  onCommit={(v) => commitColClue(c, v)}
                />
              </label>
              <DeleteButton title={`Delete column C${c}`} disabled={cols <= 1} onClick={() => removeCol(c)} />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
