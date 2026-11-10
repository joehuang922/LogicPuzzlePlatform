interface DigitBarProps {
  onDigit: (digit: number) => void;
  onClear: () => void;
  onDismiss: () => void;
  // Optional note/answer mode toggle. When onToggleMode is provided, an extra
  // "123" button toggles note mode. Omit for answer-only consumers.
  noteMode?: boolean;
  onToggleMode?: () => void;
  modeDisabled?: boolean;
  // Largest digit (default 9). Above 9 the bar is a number pad of 1..max, used on
  // desktop too (a radial dial can't hold 16-30 numbers).
  max?: number;
  // Digits shown as selected, e.g. the active cell's pencil marks.
  marked?: Set<number>;
}

export default function DigitBar({ onDigit, onClear, onDismiss, noteMode, onToggleMode, modeDisabled, max = 9, marked }: DigitBarProps) {
  const btn = max > 9 ? smallBtnStyle : digitBtnStyle;
  return (
    <div style={max > 9 ? { ...containerStyle, maxWidth: 560, margin: "0 auto" } : containerStyle}>
      {Array.from({ length: max }, (_, i) => i + 1).map((d) => (
        <button
          key={d}
          style={marked?.has(d) ? { ...btn, background: "#1976d2", color: "#fff" } : btn}
          onClick={() => onDigit(d)}
        >
          {d}
        </button>
      ))}
      {onToggleMode && (
        <button
          style={{
            ...btn,
            background: noteMode ? "#1976d2" : "#fff",
            color: noteMode ? "#fff" : "#1976d2",
            opacity: modeDisabled ? 0.4 : 1,
            cursor: modeDisabled ? "not-allowed" : "pointer",
          }}
          disabled={modeDisabled}
          onClick={onToggleMode}
          title={noteMode ? "Note mode (on)" : "Note mode (off)"}
        >
          123
        </button>
      )}
      <button style={{ ...btn, color: "#c62828", borderColor: "#c62828" }} onClick={onClear}>
        ✕
      </button>
      <button style={{ ...btn, color: "#666", borderColor: "#999" }} onClick={onDismiss}>
        ↩
      </button>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  gap: "0.4rem",
  padding: "0.6rem 0.4rem",
  background: "#fff",
  borderTop: "1px solid #ddd",
  boxShadow: "0 -2px 8px rgba(0,0,0,0.08)",
  zIndex: 900,
  flexWrap: "wrap",
};

const digitBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  fontSize: "1.1rem",
  fontWeight: "bold",
  border: "2px solid #1976d2",
  borderRadius: 8,
  background: "#fff",
  color: "#1976d2",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const smallBtnStyle: React.CSSProperties = {
  ...digitBtnStyle,
  width: 38,
  height: 34,
  fontSize: "0.95rem",
};
