import { useState } from "react";

/** The blue "i" info icon (same shape as Android's `ic_rule_info`). */
export function InfoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <circle cx="256" cy="256" r="213" fill="#2196F3" />
      <circle cx="256" cy="158" r="27" fill="#fff" />
      <path
        d="M235 232 H256 V360 M235 360 H277"
        fill="none"
        stroke="#fff"
        strokeWidth="40"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Info button next to the puzzle type badge. Clicking it floats a popup with the
 * type's rule below the button; the popup's X closes it. Renders nothing when the
 * type has no rule text. The popup is positioned against the nearest positioned
 * ancestor, so the caller wraps the badge row in a `position: relative` box and the
 * popup lines up with the badge's left edge (and stays on screen on a phone).
 */
export default function RuleInfo({ typeLabel, rule }: { typeLabel: string; rule: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rule?.trim()) return null;

  return (
    <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Rules of ${typeLabel}`}
        aria-expanded={open}
        title="Rules"
        style={iconButtonStyle}
      >
        <InfoIcon />
      </button>
      {open && (
        <div role="dialog" aria-label={`Rules of ${typeLabel}`} style={popupStyle}>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={closeStyle}>
            &times;
          </button>
          <div style={{ fontWeight: 700, marginBottom: "0.4rem", paddingRight: "1.5rem" }}>{typeLabel}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{rule}</div>
        </div>
      )}
    </span>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: 2,
  border: "none",
  background: "none",
  cursor: "pointer",
  borderRadius: "50%",
};

const popupStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 1000,
  // At most the badge row's width (its positioned ancestor), so it stays inside the card.
  width: "min(360px, 100%)",
  boxSizing: "border-box",
  padding: "0.85rem 1rem",
  fontSize: "0.88rem",
  lineHeight: 1.5,
  color: "#333",
  textAlign: "left",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
};

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: 4,
  right: 6,
  width: 28,
  height: 28,
  padding: 0,
  border: "none",
  background: "none",
  fontSize: "1.3rem",
  lineHeight: 1,
  color: "#666",
  cursor: "pointer",
};
