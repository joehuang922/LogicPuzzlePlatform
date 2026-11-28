/**
 * The parse self-check's report beside a freshly parsed nonogram (see
 * utils/parsedNonogramRepair.ts): what it fixed, each with an Undo, or the
 * suspect lines and candidate fixes when it couldn't decide. Fixes are applied
 * to the canon already; nothing is saved until the person creates the puzzle.
 */
import { NonogramCanon } from "../types/canon";
import { Fix, lineLabel } from "../utils/nonogramStrips";
import { NonogramCheck, clueText, setLine } from "../utils/parsedNonogramRepair";

export const FIXED_COLOR = "#2e7d32";
export const SUSPECT_COLOR = "#f9a825";

/** Lines to tint on the preview: fixed ones green, suspects amber. */
export function checkMarks(check: NonogramCheck | null): { axis: "row" | "col"; index: number; color: string }[] {
  const mark = (id: string, color: string) => ({ axis: id[0] === "r" ? ("row" as const) : ("col" as const), index: Number(id.slice(1)), color });
  if (check?.kind === "fixed") return check.fixes.map((f) => mark(f.id, FIXED_COLOR));
  if (check?.kind === "stuck") return [...new Set([...check.suspects, ...check.options.map((o) => o.id)])].map((id) => mark(id, SUSPECT_COLOR));
  return [];
}

function parseCanon(json: string): NonogramCanon | null {
  try {
    return JSON.parse(json) as NonogramCanon;
  } catch {
    return null;
  }
}

export default function NonogramParseCheck({
  check,
  canonRepr,
  onCanonChange,
  onCheckChange,
  onRecheck,
  compact,
}: {
  check: NonogramCheck | null;
  canonRepr: string;
  onCanonChange: (json: string) => void;
  onCheckChange: (check: NonogramCheck | null) => void;
  /** Run the check again on this canon (after the person applies a candidate). */
  onRecheck: (json: string) => void;
  /** Smaller type for batch rows. */
  compact?: boolean;
}) {
  if (!check) return null;
  const fontSize = compact ? "0.75rem" : "0.85rem";
  const box = (bg: string, border: string): React.CSSProperties => ({
    background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: compact ? "0.35rem 0.6rem" : "0.6rem 0.8rem", fontSize, lineHeight: 1.45,
  });
  const button: React.CSSProperties = { fontSize: compact ? "0.7rem" : "0.75rem", padding: "0.1rem 0.5rem", marginLeft: "0.5rem", cursor: "pointer" };
  const writeLine = (fix: Fix, to: number[] | null): string | null => {
    const canon = parseCanon(canonRepr);
    if (!canon) return null;
    const json = JSON.stringify(setLine(canon, fix.id, to ?? []), null, 2);
    onCanonChange(json);
    return json;
  };

  switch (check.kind) {
    case "running":
      return <div style={{ ...box("#f5f5f5", "#ddd"), color: "#555" }}>Checking the clues… {check.progress}</div>;
    case "error":
      return <div style={{ ...box("#fff8e1", "#ffe082"), color: "#555" }}>Couldn't check the clues: {check.message}</div>;
    case "clean":
      return <div style={{ ...box("#f1f8e9", "#c5e1a5"), color: FIXED_COLOR }}>✓ Clues check out: line logic solves the whole board.</div>;
    case "unfinished":
      return (
        <div style={{ ...box("#f5f5f5", "#ddd"), color: "#555" }}>
          No contradiction in the clues, but line logic alone doesn't finish the board. The solver check on create decides if it has one answer.
        </div>
      );
    case "fixed":
      return (
        <div style={box("#f1f8e9", "#c5e1a5")}>
          <div style={{ fontWeight: 600, color: FIXED_COLOR }}>
            Auto-corrected {check.fixes.length} misread line{check.fixes.length === 1 ? "" : "s"} (green on the board). Check against the scan:
          </div>
          {check.fixes.map((f) => (
            <div key={f.id} style={{ marginTop: "0.25rem" }}>
              <b>{lineLabel(f.id)}</b>: {clueText(f.from)} → <b>{clueText(f.to)}</b>
              <button
                type="button"
                style={button}
                onClick={() => {
                  writeLine(f, f.from);
                  const rest = check.fixes.filter((x) => x.id !== f.id);
                  onCheckChange(rest.length ? { ...check, fixes: rest } : null);
                }}
              >
                Undo
              </button>
              {f.why && <div style={{ color: "#666", fontSize: compact ? "0.7rem" : "0.78rem" }}>{f.why}</div>}
            </div>
          ))}
          {!check.complete && (
            <div style={{ marginTop: "0.25rem", color: "#8a6d00" }}>Line logic still doesn't finish the board after these fixes.</div>
          )}
        </div>
      );
    case "stuck":
      return (
        <div style={box("#fff8e1", "#ffe082")}>
          <div style={{ fontWeight: 600, color: "#8a6d00" }}>The clues contradict each other; not fixed automatically.</div>
          <div style={{ color: "#555" }}>{check.reason}</div>
          {check.suspects.length > 0 && (
            <div style={{ marginTop: "0.25rem" }}>
              Suspect lines (amber on the board): {check.suspects.slice(0, 12).map(lineLabel).join(", ")}
              {check.suspects.length > 12 ? ", …" : ""}
            </div>
          )}
          {check.options.length > 0 && (
            <div style={{ marginTop: "0.25rem" }}>
              Candidate fixes — apply the one the scan shows:
              {check.options.slice(0, 10).map((o, i) => (
                <div key={`${o.id}-${i}`} style={{ marginTop: "0.2rem" }}>
                  <b>{lineLabel(o.id)}</b>: {clueText(o.from)} → <b>{clueText(o.to)}</b>
                  <button
                    type="button"
                    style={button}
                    onClick={() => {
                      // A candidate may be one half of a pair: checking again finds the rest.
                      const json = writeLine(o, o.to);
                      if (json) onRecheck(json);
                    }}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
  }
}
