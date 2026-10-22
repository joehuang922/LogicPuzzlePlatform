import type { CSSProperties } from "react";

// Shown after the solver gate rejected a puzzle only because it timed out. Resubmits
// with allowUnverified: the server still rejects a proven no/multiple solution, and an
// overridden puzzle is stored as "unknown" so it stays in the flagged review list.
export default function OverrideGateButton({
  onClick,
  disabled,
  style,
}: {
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="The solver timed out on this puzzle. Register it without a uniqueness proof; it will be listed under flagged puzzles."
      style={{ background: "#fff", color: "#b26a00", border: "1px solid #b26a00", cursor: "pointer", ...style }}
    >
      Override solver timeout
    </button>
  );
}
