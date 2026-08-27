import { useState, useMemo, useCallback, useEffect} from "react";
import { TentaishowCanon } from "../types/canon";

interface TentaishowEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;

function parseCanon(json: string): TentaishowCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed.width === "number" &&
      typeof parsed.height === "number" &&
      Array.isArray(parsed.dots)
    ) {
      return parsed as TentaishowCanon;
    }
  } catch {}
  return null;
}

function makeEmptyCanon(width: number, height: number): TentaishowCanon {
  return { width, height, dots: [] };
}

export default function TentaishowEditor({
  initialJson,
  onChange,
}: TentaishowEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const width = canon ? canon.width : 0;
  const height = canon ? canon.height : 0;

  const updateJson = useCallback((newCanon: TentaishowCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  // Snap a pixel click to the nearest doubled coordinate and cycle the dot
  // there: none -> white (0) -> black (1) -> none.
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!canon) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      // Map client coords into viewBox coords, then subtract PAD offset.
      const vx = ((e.clientX - rect.left) / rect.width) * (width * CELL_SIZE + PAD * 2) - PAD;
      const vy = ((e.clientY - rect.top) / rect.height) * (height * CELL_SIZE + PAD * 2) - PAD;
      const dc = Math.round((vx / CELL_SIZE) * 2);
      const dr = Math.round((vy / CELL_SIZE) * 2);
      // Only interior doubled coords are valid (dots never on the border).
      if (dr < 1 || dr > 2 * height - 1 || dc < 1 || dc > 2 * width - 1) return;

      const dots = canon.dots.map((d) => ({ ...d }));
      const idx = dots.findIndex((d) => d.dr === dr && d.dc === dc);
      if (idx === -1) {
        dots.push({ dr, dc, color: 0 });
      } else if (dots[idx].color === 0) {
        dots[idx].color = 1;
      } else {
        dots.splice(idx, 1);
      }
      updateJson({ width, height, dots });
    },
    [canon, width, height, updateJson]
  );

  function handleResize(newWidth: number, newHeight: number) {
    if (newWidth < 1 || newHeight < 1) return;
    if (canon) {
      const dots = canon.dots.filter(
        (d) => d.dr <= 2 * newHeight - 1 && d.dc <= 2 * newWidth - 1
      );
      updateJson({ width: newWidth, height: newHeight, dots });
    } else {
      updateJson(makeEmptyCanon(newWidth, newHeight));
    }
  }

  if (!canon) {
    return (
      <div
        style={{
          border: "2px solid #c33",
          borderRadius: 8,
          padding: "1rem",
          background: "#fff8f8",
        }}
      >
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid tentaishow JSON. Fix the textarea below or create a new grid.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(10, 10))}>
            Create 10x10 grid
          </button>
        </div>
        <textarea
          style={{
            width: "100%",
            minHeight: 200,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            padding: "0.5rem",
          }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const svgWidth = width * CELL_SIZE + PAD * 2;
  const svgHeight = height * CELL_SIZE + PAD * 2;

  const elements: JSX.Element[] = [];

  // Cell backgrounds.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elements.push(
        <rect
          key={`bg-${r}-${c}`}
          x={c * CELL_SIZE}
          y={r * CELL_SIZE}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill="white"
        />
      );
    }
  }

  // Grid lines: dashed interior, solid border.
  for (let r = 0; r <= height; r++) {
    const isBorder = r === 0 || r === height;
    elements.push(
      <line
        key={`hline-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={width * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke={isBorder ? "#333" : "#999"}
        strokeWidth={isBorder ? 2 : 0.75}
        strokeDasharray={isBorder ? undefined : "3,3"}
      />
    );
  }
  for (let c = 0; c <= width; c++) {
    const isBorder = c === 0 || c === width;
    elements.push(
      <line
        key={`vline-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={height * CELL_SIZE}
        stroke={isBorder ? "#333" : "#999"}
        strokeWidth={isBorder ? 2 : 0.75}
        strokeDasharray={isBorder ? undefined : "3,3"}
      />
    );
  }

  // Dots at doubled coordinates.
  canon.dots.forEach((dot, i) => {
    elements.push(
      <circle
        key={`dot-${i}`}
        cx={(dot.dc / 2) * CELL_SIZE}
        cy={(dot.dr / 2) * CELL_SIZE}
        r={CELL_SIZE * 0.2}
        fill={dot.color === 1 ? "#111" : "white"}
        stroke="#111"
        strokeWidth={2}
        pointerEvents="none"
      />
    );
  });

  return (
    <div
      style={{
        border: "2px solid #4a90d9",
        borderRadius: 8,
        padding: "1rem",
        background: "#f8fbff",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Width:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={width}
            onChange={(e) => handleResize(Number(e.target.value) || 1, height)}
            style={{
              width: 50,
              padding: "0.25rem",
              fontSize: "0.85rem",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Height:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={height}
            onChange={(e) => handleResize(width, Number(e.target.value) || 1)}
            style={{
              width: 50,
              padding: "0.25rem",
              fontSize: "0.85rem",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        </div>
        <span style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click near a cell center / edge / corner to cycle: none → ○ → ● → none
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 600)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{
              border: "1px solid #ccc",
              userSelect: "none",
              display: "block",
              background: "white",
              cursor: "pointer",
            }}
            onClick={handleSvgClick}
          >
            <g transform={`translate(${PAD},${PAD})`}>{elements}</g>
          </svg>
        </div>

      </div>

    </div>
  );
}
