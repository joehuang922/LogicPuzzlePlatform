import { useState, useCallback, useEffect } from "react";

export interface GridCellInputOptions {
  rows: number;
  cols: number;
  cells: number[][];
  setCellValue: (r: number, c: number, val: number) => void;
}

export interface GridCellInputResult {
  focused: { r: number; c: number } | null;
  setFocused: (pos: { r: number; c: number } | null) => void;
  handleCellClick: (r: number, c: number) => void;
}

export function useGridCellInput({
  rows,
  cols,
  cells,
  setCellValue,
}: GridCellInputOptions): GridCellInputResult {
  const [focused, setFocused] = useState<{ r: number; c: number } | null>(null);

  const handleCellClick = useCallback((r: number, c: number) => {
    setFocused({ r, c });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!focused) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setCellValue(focused.r, focused.c, 0);
        return;
      }

      if (e.key === "Escape") {
        setFocused(null);
        return;
      }

      if (e.key === "ArrowUp" && focused.r > 0) {
        e.preventDefault();
        setFocused({ r: focused.r - 1, c: focused.c });
        return;
      }
      if (e.key === "ArrowDown" && focused.r < rows - 1) {
        e.preventDefault();
        setFocused({ r: focused.r + 1, c: focused.c });
        return;
      }
      if (e.key === "ArrowLeft" && focused.c > 0) {
        e.preventDefault();
        setFocused({ r: focused.r, c: focused.c - 1 });
        return;
      }
      if (e.key === "ArrowRight" && focused.c < cols - 1) {
        e.preventDefault();
        setFocused({ r: focused.r, c: focused.c + 1 });
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const current = cells[focused.r][focused.c];
        const digit = Number(e.key);
        let newVal: number;
        if (current > 0) {
          newVal = current * 10 + digit;
        } else {
          newVal = digit;
        }
        setCellValue(focused.r, focused.c, newVal);
      }
    },
    [focused, cells, rows, cols, setCellValue]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { focused, setFocused, handleCellClick };
}
