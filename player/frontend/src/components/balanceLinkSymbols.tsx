// Vector drawings of the Balance Link symbols, shared by the board and the editor.
import { symbolIsBlack, symbolShape } from "./balanceLinkRules";

const INK = "#222";

function starPoints(cx: number, cy: number, outer: number, inner: number, tips: number): string {
  const pts: string[] = [];
  for (let i = 0; i < tips * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / tips;
    pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`);
  }
  return pts.join(" ");
}

/** The symbol `code` centred at (cx, cy), fitting a circle of radius `r`. */
export function BalanceSymbol({ code, cx, cy, r }: { code: number; cx: number; cy: number; r: number }) {
  const fill = symbolIsBlack(code) ? INK : "#fff";
  const common = { fill, stroke: INK, strokeWidth: 1.5, pointerEvents: "none" as const };
  switch (symbolShape(code)) {
    case 1:
      return <circle cx={cx} cy={cy} r={r * 0.9} {...common} />;
    case 2: {
      const s = r * 0.75;
      return <rect x={cx - s} y={cy - s} width={2 * s} height={2 * s} {...common} />;
    }
    case 3:
      return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...common} />;
    case 4:
      return (
        <polygon
          points={`${cx},${cy - r} ${cx + r * 0.95},${cy + r * 0.7} ${cx - r * 0.95},${cy + r * 0.7}`}
          {...common}
        />
      );
    case 5:
      return (
        <polygon
          points={`${cx},${cy + r} ${cx + r * 0.95},${cy - r * 0.7} ${cx - r * 0.95},${cy - r * 0.7}`}
          {...common}
        />
      );
    case 6:
      return <polygon points={starPoints(cx, cy + r * 0.08, r, r * 0.42, 5)} {...common} />;
    case 7:
      return <polygon points={starPoints(cx, cy, r, r * 0.32, 4)} {...common} />;
    default:
      return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r}>?</text>;
  }
}
