const RADIAL_RADIUS = 44;
const CIRCLE_RADIUS = 13;

// Ten slots evenly around the ring: index 0 is the erase button (top),
// indices 1-9 are the digits going clockwise.
const positions = Array.from({ length: 10 }, (_, i) => {
  const angle = (i * 36 - 90) * (Math.PI / 180);
  return { x: Math.cos(angle) * RADIAL_RADIUS, y: Math.sin(angle) * RADIAL_RADIUS };
});

interface RadialInputProps {
  // Center of the dial, in the parent SVG group's coordinate space.
  cx: number;
  cy: number;
  // A full-board rectangle used as a tap-to-dismiss backdrop.
  backdrop: { x: number; y: number; width: number; height: number };
  onDigit: (digit: number) => void;
  onErase: () => void;
  onDismiss: () => void;
}

// A contextual radial digit picker (1-9 + erase), rendered as an SVG <g> so it
// can overlay a board at a chosen cell. Shared by Sudoku, Combo Sudoku, and
// Kakuro. The parent decides when to show it and where its center sits.
export default function RadialInput({ cx, cy, backdrop, onDigit, onErase, onDismiss }: RadialInputProps) {
  return (
    <g>
      <rect
        x={backdrop.x}
        y={backdrop.y}
        width={backdrop.width}
        height={backdrop.height}
        fill="transparent"
        onClick={onDismiss}
        onContextMenu={(e) => {
          e.preventDefault();
          onDismiss();
        }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={RADIAL_RADIUS + CIRCLE_RADIUS + 4}
        fill="white"
        fillOpacity={0.9}
        stroke="#ccc"
        strokeWidth={1}
      />
      {positions.map((pos, i) => {
        const isErase = i === 0;
        const digit = i;
        const px = cx + pos.x;
        const py = cy + pos.y;
        return (
          <g
            key={`rad-${i}`}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              if (isErase) onErase();
              else onDigit(digit);
            }}
          >
            <circle
              cx={px}
              cy={py}
              r={CIRCLE_RADIUS}
              fill="white"
              stroke={isErase ? "#c62828" : "#666"}
              strokeWidth={1.5}
            />
            {isErase ? (
              <g pointerEvents="none">
                <line x1={px - 5} y1={py - 5} x2={px + 5} y2={py + 5} stroke="#c62828" strokeWidth={2} strokeLinecap="round" />
                <line x1={px + 5} y1={py - 5} x2={px - 5} y2={py + 5} stroke="#c62828" strokeWidth={2} strokeLinecap="round" />
              </g>
            ) : (
              <text
                x={px}
                y={py}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontFamily="sans-serif"
                fill="#444"
                pointerEvents="none"
              >
                {digit}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
