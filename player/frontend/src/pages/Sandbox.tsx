import { useState } from "react";
import ComboSudokuBoard from "../components/ComboSudokuBoard";

const EXAMPLE_JSON = JSON.stringify(
  {
    subboards: [
      {
        x: 2,
        y: 0,
        hints: [
          [0, 0, 0, 0, 2, 5, 0, 0, 0],
          [0, 0, 5, 1, 0, 0, 8, 0, 0],
          [0, 7, 0, 0, 0, 0, 3, 0, 0],
          [0, 6, 0, 0, 8, 0, 0, 2, 0],
          [0, 0, 3, 0, 0, 0, 0, 6, 0],
          [0, 0, 1, 0, 0, 4, 5, 0, 0],
          [0, 0, 0, 4, 3, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
      {
        x: 0,
        y: 2,
        hints: [
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 5, 8, 0, 0, 0, 0],
          [0, 5, 7, 0, 0, 4, 0, 0, 0],
          [7, 0, 0, 0, 0, 9, 0, 0, 0],
          [6, 0, 0, 3, 0, 0, 2, 0, 0],
          [0, 1, 0, 0, 0, 0, 4, 0, 0],
          [0, 8, 0, 0, 3, 1, 0, 0, 0],
          [0, 0, 1, 7, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
      {
        x: 4,
        y: 2,
        hints: [
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 5, 1, 0, 0],
          [0, 0, 0, 6, 1, 0, 0, 7, 0],
          [0, 0, 7, 0, 0, 0, 0, 5, 0],
          [0, 0, 3, 0, 0, 1, 0, 0, 2],
          [0, 0, 0, 4, 0, 0, 0, 0, 9],
          [0, 0, 0, 7, 0, 0, 6, 2, 0],
          [0, 0, 0, 0, 4, 3, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
      {
        x: 2,
        y: 4,
        hints: [
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 3, 2, 0, 0, 0],
          [0, 0, 2, 1, 0, 0, 5, 0, 0],
          [0, 7, 0, 0, 0, 0, 2, 0, 0],
          [0, 4, 0, 0, 6, 0, 0, 7, 0],
          [0, 0, 1, 0, 0, 0, 0, 2, 0],
          [0, 0, 5, 0, 0, 9, 1, 0, 0],
          [0, 0, 0, 5, 4, 0, 0, 0, 0],
        ],
      },
    ],
  },
  null,
  2
);

interface Subboard {
  x: number;
  y: number;
  hints: number[][];
}

export default function Sandbox() {
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON);
  const [board, setBoard] = useState<Subboard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRender() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.subboards || !Array.isArray(parsed.subboards)) {
        setError("JSON must have a 'subboards' array");
        setBoard(null);
        return;
      }
      setBoard(parsed.subboards);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setBoard(null);
    }
  }

  return (
    <div>
      <h2>Combo-Sudoku Sandbox</h2>
      <div style={{ marginBottom: "1rem" }}>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={20}
          cols={60}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>
      <button onClick={handleRender} style={{ marginBottom: "1rem" }}>
        Render
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {board && <ComboSudokuBoard subboards={board} />}
    </div>
  );
}
