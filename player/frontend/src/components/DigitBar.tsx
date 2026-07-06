interface DigitBarProps {
  onDigit: (digit: number) => void;
  onClear: () => void;
  onDismiss: () => void;
}

export default function DigitBar({ onDigit, onClear, onDismiss }: DigitBarProps) {
  return (
    <div style={containerStyle}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <button key={d} style={digitBtnStyle} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button style={{ ...digitBtnStyle, color: "#c62828", borderColor: "#c62828" }} onClick={onClear}>
        ✕
      </button>
      <button style={{ ...digitBtnStyle, color: "#666", borderColor: "#999" }} onClick={onDismiss}>
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
