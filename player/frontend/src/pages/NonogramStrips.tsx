import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Collection,
  PARSER_IS_LOCAL,
  StripLineReading,
  createPuzzle,
  creationTargets,
  isGateTimeout,
  listCollections,
  parseNonogramStrip,
  sortCollections,
} from "../api/client";
import OverrideGateButton from "../components/OverrideGateButton";
import { DIFFICULTY_OPTIONS } from "../constants";
import { useIsMobile } from "../hooks/useIsMobile";
import { cardStyle, errorStyle, fieldStyle, inputStyle } from "../styles/admin";
import { extractBase64 } from "../utils/image";
import {
  Axis,
  Check,
  LineId,
  LineResult,
  StripInput,
  checkClues,
  combineLines,
  findSuspects,
  lineLabel,
  parseClueText,
  placeStrips,
  propagate,
} from "../utils/nonogramStrips";
import { runLimited, withRetry } from "../utils/runLimited";

/**
 * Big-nonogram strip editor: a board too big for one photo is entered from
 * scans of its clue strips. Upload the strips, mark each as row or column
 * clues, read them, check where they landed, fix what the checks point at,
 * and create the question.
 */

// The deployed parser has 2 minutes per request and ~1.7 vCPU: a strip is
// read by this many requests at once, each taking a share of its lines.
const SHARES = PARSER_IS_LOCAL ? 1 : 4;
// All the account's Lambdas share a concurrency cap of 10.
const IN_FLIGHT = PARSER_IS_LOCAL ? 2 : 4;
// Lambda Function URLs take at most 6 MB per request.
const MAX_BASE64 = 4_500_000;

interface StripItem {
  id: string;
  name: string;
  url: string; // object URL for display and crops
  base64: string;
  width: number;
  height: number;
  orientation: Axis;
  status: "idle" | "reading" | "done" | "error";
  sharesDone: number;
  error?: string;
  lineCount?: number;
  startBorder?: boolean;
  endBorder?: boolean;
  thick?: boolean[];
  lines?: (StripLineReading | null)[];
  manualOffset: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  ok: "#66bb6a",
  edited: "#42a5f5",
  flagged: "#ffca28",
  conflict: "#ef5350",
  missing: "#bdbdbd",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image"));
    img.src = url;
  });
}

/** The image as base64 JPEG, re-encoded (same size) when too big to send. */
async function encodeForParser(file: File, img: HTMLImageElement): Promise<string> {
  const original = extractBase64(
    await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    }),
  );
  if (original.length <= MAX_BASE64) return original;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  for (const q of [0.9, 0.85, 0.8, 0.7]) {
    const b64 = extractBase64(canvas.toDataURL("image/jpeg", q));
    if (b64.length <= MAX_BASE64) return b64;
  }
  throw new Error("Image too large to send, even re-compressed: crop it closer to the clues");
}

let nextId = 1;

export default function NonogramStrips() {
  const isMobile = useIsMobile();
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [strips, setStrips] = useState<StripItem[]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [edits, setEdits] = useState<Record<Axis, Map<number, number[]>>>({ rows: new Map(), cols: new Map() });
  const [axisView, setAxisView] = useState<Axis>("rows");
  const [problemsOnly, setProblemsOnly] = useState(true);
  const [logic, setLogic] = useState<{ key: string; settled: number; total: number; contradiction: LineId | null } | null>(null);
  const [suspects, setSuspects] = useState<{ key: string; ids: LineId[] } | null>(null);
  const [searching, setSearching] = useState<string | null>(null);

  const W = Number(width) || 0;
  const H = Number(height) || 0;
  const sizeOk = W > 0 && H > 0;

  const update = (id: string, patch: Partial<StripItem>) =>
    setStrips((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const base64 = await encodeForParser(file, img);
        const id = `s${nextId++}`;
        images.current.set(id, img);
        setStrips((ss) => [
          ...ss,
          {
            id, name: file.name, url, base64,
            width: img.naturalWidth, height: img.naturalHeight,
            // Row clue strips are usually taller than wide, column strips wider.
            orientation: img.naturalWidth > img.naturalHeight ? "cols" : "rows",
            status: "idle", sharesDone: 0, manualOffset: null,
          },
        ]);
      } catch (e) {
        alert(`${file.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  async function readStrips(targets: StripItem[]) {
    if (!sizeOk) return;
    for (const s of targets) {
      update(s.id, { status: "reading", sharesDone: 0, error: undefined, lines: undefined, lineCount: undefined, manualOffset: null });
    }
    const jobs = targets.flatMap((s) => Array.from({ length: SHARES }, (_, k) => ({ s, k })));
    const failed = new Set<string>();
    await runLimited(jobs, IN_FLIGHT, async ({ s, k }) => {
      if (failed.has(s.id)) return;
      try {
        const res = await withRetry(() =>
          parseNonogramStrip(s.base64, s.orientation, s.orientation === "rows" ? W : H, k, SHARES),
        );
        setStrips((ss) =>
          ss.map((x) => {
            if (x.id !== s.id || x.status !== "reading") return x;
            const lines = x.lines && x.lines.length === res.lineCount ? [...x.lines] : new Array(res.lineCount).fill(null);
            for (const ln of res.lines) lines[ln.index] = ln;
            const sharesDone = x.sharesDone + 1;
            return {
              ...x, lines, sharesDone,
              lineCount: res.lineCount, startBorder: res.startBorder, endBorder: res.endBorder, thick: res.thick,
              status: sharesDone === SHARES ? "done" : "reading",
            };
          }),
        );
      } catch (e) {
        failed.add(s.id);
        const status = (e as { status?: number }).status;
        const msg = e instanceof Error ? e.message : String(e);
        update(s.id, {
          status: "error",
          error: status === 422 ? `${msg} — is it a ${s.orientation === "rows" ? "column" : "row"} strip?` : msg,
        });
      }
    });
  }

  // --- merge -------------------------------------------------------------------
  const merged = useMemo(() => {
    const out = {} as Record<Axis, { lines: LineResult[]; placements: ReturnType<typeof placeStrips>; inputs: StripInput[] }>;
    for (const axis of ["rows", "cols"] as Axis[]) {
      const length = axis === "rows" ? H : W;
      const inputs: StripInput[] = strips
        .filter((s) => s.orientation === axis && s.status === "done" && s.lines)
        .map((s) => ({
          id: s.id, lines: s.lines!, thick: s.thick ?? [],
          startBorder: !!s.startBorder, endBorder: !!s.endBorder, manualOffset: s.manualOffset,
        }));
      const placements = placeStrips(inputs, length);
      out[axis] = { lines: length ? combineLines(inputs, placements, length, edits[axis]) : [], placements, inputs };
    }
    return out;
  }, [strips, edits, W, H]);

  const rowClues = merged.rows.lines.map((l) => l.clues);
  const colClues = merged.cols.lines.map((l) => l.clues);
  const allRead = sizeOk && [...rowClues, ...colClues].every((c) => c !== null);
  const clueKey = allRead ? JSON.stringify([rowClues, colClues]) : "";
  const checks: Check[] = sizeOk ? checkClues(merged.rows.lines, merged.cols.lines) : [];
  const formatOk = sizeOk && checks.every((c) => c.ok || !c.blocking);
  const currentLogic = logic && logic.key === clueKey ? logic : null;
  const currentSuspects = suspects && suspects.key === clueKey ? suspects.ids : [];

  async function runLineLogic() {
    if (!allRead) return;
    const key = clueKey;
    const rc = rowClues as number[][], cc = colClues as number[][];
    setSearching("line logic…");
    await new Promise((r) => setTimeout(r, 0));
    const p = propagate(rc, cc);
    setLogic({ key, ...p });
    if (p.contradiction) {
      const ids = await findSuspects(rc, cc, (done, total) => setSearching(`looking for the misread line… ${done}/${total}`));
      setSuspects({ key, ids });
    } else {
      setSuspects({ key, ids: [] });
    }
    setSearching(null);
  }

  function setEdit(axis: Axis, index: number, clues: number[] | null) {
    setEdits((e) => {
      const m = new Map(e[axis]);
      if (clues) m.set(index, clues);
      else m.delete(index);
      return { ...e, [axis]: m };
    });
  }

  const axisLines = merged[axisView].lines;
  const suspectSet = new Set(currentSuspects);
  const shown = axisLines.filter(
    (l) => !problemsOnly || l.status !== "ok" || suspectSet.has(`${axisView === "rows" ? "r" : "c"}${l.index}` as LineId),
  );

  return (
    <div>
      <p><Link to="/admin">← Admin</Link></p>
      <h1>Big nonogram from clue strips</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        For a board too big for one photo: scan its row clues and column clues in overlapping strips,
        each showing a few board cells next to the clues.
      </p>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>1. Board size</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label style={fieldStyle}>Columns (width)
            <input style={inputStyle} type="number" min={1} value={width} onChange={(e) => setWidth(e.target.value)} />
          </label>
          <label style={fieldStyle}>Rows (height)
            <input style={inputStyle} type="number" min={1} value={height} onChange={(e) => setHeight(e.target.value)} />
          </label>
        </div>
        {sizeOk && <p style={{ marginBottom: 0, color: "#555" }}>{W} × {H} = {(W * H).toLocaleString()} cells</p>}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>2. Clue strips</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <label style={{ ...buttonLike }}>
            Add images
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {isMobile && (
            <label style={{ ...buttonLike }}>
              Take photo
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
          <button
            disabled={!sizeOk || !strips.some((s) => s.status === "idle" || s.status === "error")}
            onClick={() => readStrips(strips.filter((s) => s.status === "idle" || s.status === "error"))}
          >
            Read new strips
          </button>
          {!sizeOk && strips.length > 0 && <span style={errorStyle}>Set the board size first</span>}
        </div>
        {strips.map((s) => {
          const axisLength = s.orientation === "rows" ? H : W;
          const p = merged[s.orientation].placements.get(s.id);
          return (
            <div key={s.id} style={{ display: "flex", gap: "0.75rem", padding: "0.5rem 0", borderTop: "1px solid #eee", alignItems: "flex-start", flexWrap: "wrap" }}>
              <img src={s.url} alt="" style={{ width: 96, height: 96, objectFit: "contain", background: "#f5f5f5", borderRadius: 4 }} />
              <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ wordBreak: "break-all" }}>{s.name}</strong>
                  <span style={{ color: "#888", fontSize: "0.8rem" }}>{s.width}×{s.height}</span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                  {(["rows", "cols"] as Axis[]).map((o) => (
                    <button
                      key={o}
                      disabled={s.status === "reading"}
                      onClick={() => update(s.id, { orientation: o, status: "idle", lines: undefined, manualOffset: null, error: undefined })}
                      style={{ fontWeight: s.orientation === o ? 700 : 400, background: s.orientation === o ? "#e3f2fd" : undefined }}
                    >
                      {o === "rows" ? "Row clues" : "Column clues"}
                    </button>
                  ))}
                  {s.status !== "reading" && sizeOk && (
                    <button onClick={() => readStrips([s])}>{s.status === "idle" ? "Read" : "Read again"}</button>
                  )}
                  <button
                    disabled={s.status === "reading"}
                    onClick={() => { setStrips((ss) => ss.filter((x) => x.id !== s.id)); images.current.delete(s.id); URL.revokeObjectURL(s.url); }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#555" }}>
                  {s.status === "idle" && "Not read yet."}
                  {s.status === "reading" && `Reading… ${s.sharesDone}/${SHARES}`}
                  {s.status === "error" && <span style={{ color: "#c62828" }}>{s.error}</span>}
                  {s.status === "done" && (
                    <>
                      {s.lineCount} {s.orientation === "rows" ? "rows" : "columns"}
                      {s.startBorder && ", shows the board's first line"}
                      {s.endBorder && ", shows the board's last line"}
                      {s.lines && s.lines.some((l) => l && !l.complete) && `, ${s.lines.filter((l) => l && !l.complete).length} cut off at the edge`}
                    </>
                  )}
                </div>
                {s.status === "done" && p && (
                  <div style={{ fontSize: "0.85rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                    {p.offset !== null ? (
                      <span>
                        Placed at {s.orientation === "rows" ? "rows" : "columns"} {p.offset + 1}–{p.offset + (s.lineCount ?? 0)} of {axisLength}
                        <span style={{ color: "#888" }}> ({p.how}{p.how === "overlap" ? `, ${p.agree} lines agree` : ""})</span>
                      </span>
                    ) : (
                      <span style={{ color: "#c62828" }}>Not placed: {p.note}</span>
                    )}
                    <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                      first line
                      <input
                        type="number"
                        style={{ ...inputStyle, width: 70, padding: "0.15rem 0.3rem" }}
                        value={p.offset !== null ? p.offset + 1 : ""}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          update(s.id, { manualOffset: Number.isFinite(v) ? v - 1 : null });
                        }}
                      />
                    </label>
                    {s.manualOffset !== null && <button onClick={() => update(s.id, { manualOffset: null })}>Auto</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sizeOk && strips.some((s) => s.status === "done") && (
          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Coverage label="Rows" lines={merged.rows.lines} />
            <Coverage label="Columns" lines={merged.cols.lines} />
            <Legend />
          </div>
        )}
      </section>

      {sizeOk && strips.some((s) => s.status === "done") && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>3. Check and fix</h2>
          <ul style={{ paddingLeft: "1.2rem", marginTop: 0 }}>
            {checks.map((c) => (
              <li key={c.name} style={{ color: c.ok ? "#2e7d32" : c.blocking ? "#c62828" : "#b26a00" }}>
                <strong>{c.name}:</strong> {c.detail}
              </li>
            ))}
            <li style={{ color: !currentLogic ? "#555" : currentLogic.contradiction ? "#c62828" : "#2e7d32" }}>
              <strong>Line logic:</strong>{" "}
              {!allRead && "needs every line read"}
              {allRead && !currentLogic && !searching && "not run on these clues yet"}
              {searching}
              {currentLogic && !searching && (currentLogic.contradiction
                ? `the clues contradict each other; ${currentSuspects.length
                    ? `suspect: ${currentSuspects.map(lineLabel).join(", ")}`
                    : "no single line explains it (more than one misread)"}`
                : currentLogic.settled === currentLogic.total
                  ? "solves every cell: the clues have a unique picture"
                  : `consistent; settles ${currentLogic.settled.toLocaleString()} of ${currentLogic.total.toLocaleString()} cells (the server's solver decides the rest)`)}
            </li>
          </ul>
          <button disabled={!allRead || !!searching} onClick={runLineLogic}>Run line logic</button>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "1rem 0 0.5rem", flexWrap: "wrap" }}>
            {(["rows", "cols"] as Axis[]).map((a) => (
              <button key={a} onClick={() => setAxisView(a)} style={{ fontWeight: axisView === a ? 700 : 400, background: axisView === a ? "#e3f2fd" : undefined }}>
                {a === "rows" ? "Rows" : "Columns"} ({merged[a].lines.filter((l) => l.status !== "ok").length} to look at)
              </button>
            ))}
            <label style={{ marginLeft: "auto", display: "flex", gap: "0.3rem", alignItems: "center" }}>
              <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} /> problems only
            </label>
          </div>
          {shown.length === 0 && <p style={{ color: "#555" }}>Nothing to look at here.</p>}
          {shown.map((l) => (
            <LineRow
              key={`${axisView}-${l.index}`}
              axis={axisView}
              line={l}
              suspect={suspectSet.has(`${axisView === "rows" ? "r" : "c"}${l.index}` as LineId)}
              strips={strips}
              images={images.current}
              onEdit={(clues) => setEdit(axisView, l.index, clues)}
            />
          ))}
        </section>
      )}

      {sizeOk && strips.some((s) => s.status === "done") && (
        <CreatePanel
          ready={formatOk && allRead && !searching}
          blockedBy={!allRead ? "every line must be read" : !formatOk ? "fix the red checks first" : null}
          width={W}
          height={H}
          rowClues={rowClues as number[][]}
          colClues={colClues as number[][]}
          onContradiction={async () => { await runLineLogic(); }}
        />
      )}
    </div>
  );
}

const buttonLike: React.CSSProperties = {
  display: "inline-block",
  padding: "0.35rem 0.8rem",
  border: "1px solid #888",
  borderRadius: 4,
  background: "#f5f5f5",
  cursor: "pointer",
};

function Coverage({ label, lines }: { label: string; lines: LineResult[] }) {
  if (!lines.length) return null;
  const counts = lines.reduce<Record<string, number>>((a, l) => ({ ...a, [l.status]: (a[l.status] ?? 0) + 1 }), {});
  return (
    <div>
      <div style={{ fontSize: "0.85rem", marginBottom: "0.2rem" }}>
        <strong>{label}</strong>{" "}
        <span style={{ color: "#555" }}>
          {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}
        </span>
      </div>
      <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", border: "1px solid #ccc" }}>
        {lines.map((l) => (
          <div
            key={l.index}
            title={`${label.slice(0, -1)} ${l.index + 1}: ${l.status}`}
            style={{ flex: 1, background: STATUS_COLORS[l.status], borderRight: (l.index + 1) % 5 === 0 ? "1px solid rgba(0,0,0,0.25)" : undefined }}
          />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const text: Record<string, string> = {
    ok: "read", edited: "edited", flagged: "doubtful reading", conflict: "strips disagree", missing: "no strip covers it",
  };
  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.8rem", color: "#555" }}>
      {Object.entries(text).map(([k, v]) => (
        <span key={k} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <span style={{ width: 12, height: 12, background: STATUS_COLORS[k], borderRadius: 2, display: "inline-block" }} /> {v}
        </span>
      ))}
    </div>
  );
}

const FLAG_TEXT: Record<string, string> = {
  gap: "a blank cell between numbers (a missed or extra number?)",
  detached: "numbers don't start at the board edge",
  no_clue: "no numbers read",
  cut_at_image_edge: "the clue grid runs off the image",
};

function describeFlag(flag: string): string {
  if (flag.startsWith("uncertain:")) return "the two crops read some numbers differently (marked)";
  if (flag.startsWith("ghost_dropped:")) return `dropped a lone ${flag.split(":")[1]} past a blank cell (smudge?)`;
  return FLAG_TEXT[flag] ?? flag;
}

function LineRow({
  axis, line, suspect, strips, images, onEdit,
}: {
  axis: Axis;
  line: LineResult;
  suspect: boolean;
  strips: StripItem[];
  images: Map<string, HTMLImageElement>;
  onEdit: (clues: number[] | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = line.clues?.join(" ") ?? "";
  const value = draft ?? current;
  const parsed = draft === null ? line.clues : parseClueText(draft);
  const name = `${axis === "rows" ? "Row" : "Column"} ${line.index + 1}`;

  function commit() {
    if (draft === null) return;
    const clues = parseClueText(draft);
    setDraft(null);
    if (!clues) return;
    // Back to what the strips agree on: drop the edit.
    const readings = new Set(line.readings.map((r) => r.clues.join(" ")));
    if (readings.size === 1 && readings.has(clues.join(" "))) onEdit(null);
    else onEdit(clues);
  }

  return (
    <div style={{ borderTop: "1px solid #eee", padding: "0.6rem 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ minWidth: 92 }}>{name}</strong>
        <span style={{ fontSize: "0.75rem", padding: "0.05rem 0.4rem", borderRadius: 3, background: STATUS_COLORS[line.status] }}>
          {line.status}
        </span>
        {suspect && (
          <span style={{ fontSize: "0.75rem", padding: "0.05rem 0.4rem", borderRadius: 3, background: "#c62828", color: "#fff" }}>
            line logic: likely misread
          </span>
        )}
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 200, fontFamily: "monospace", borderColor: draft !== null && !parsed ? "#c62828" : "#ccc" }}
          value={value}
          placeholder="clues, e.g. 3 1 12"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(null); }}
        />
        {line.status === "edited" && <button onClick={() => { setDraft(null); onEdit(null); }}>Undo edit</button>}
      </div>
      {line.readings.map((r) => {
        const strip = strips.find((s) => s.id === r.stripId);
        const img = images.get(r.stripId);
        const unsure = new Set(
          r.flags.filter((f) => f.startsWith("uncertain:")).flatMap((f) => f.slice(10).split(",").map(Number)),
        );
        return (
          <div key={r.stripId} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {img && r.boxes.length > 0 && <CellMosaic img={img} boxes={r.boxes} clues={r.clues} unsure={unsure} />}
            <div style={{ fontSize: "0.78rem", color: "#666" }}>
              {strip?.name ?? r.stripId}: {r.clues.join(" ") || "—"}
              {r.flags.map((f) => ` · ${describeFlag(f)}`).join("")}
            </div>
          </div>
        );
      })}
      {!line.readings.length && <div style={{ fontSize: "0.8rem", color: "#888" }}>No strip covers this line: type its clues.</div>}
    </div>
  );
}

/** The clue cells of one reading, side by side, upright, each over its number. */
function CellMosaic({ img, boxes, clues, unsure }: { img: HTMLImageElement; boxes: number[][]; clues: number[]; unsure: Set<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const H = 34;
  // A little of the neighbouring cells shows around each one: a digit the
  // reader's box cut off is then still visible to compare.
  const tiles = boxes.map(([x1, y1, x2, y2]) => {
    const w = Math.max(1, x2 - x1), h = Math.max(1, y2 - y1);
    const px = Math.round(0.15 * w), py = Math.round(0.1 * h);
    return { x1: x1 - px, y1: y1 - py, w: w + 2 * px, h: h + 2 * py };
  });
  const widths = tiles.map((t) => Math.round((t.w / t.h) * H));
  const total = widths.reduce((a, b) => a + b, 0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    let x = 0;
    tiles.forEach((t, i) => {
      ctx.drawImage(img, t.x1, t.y1, t.w, t.h, x, 0, widths[i], H);
      ctx.strokeStyle = unsure.has(i) ? "#c62828" : "#ddd";
      ctx.lineWidth = unsure.has(i) ? 2 : 1;
      ctx.strokeRect(x + 0.5, 0.5, widths[i] - 1, H - 1);
      ctx.fillStyle = unsure.has(i) ? "#c62828" : "#1565c0";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(clues[i] ?? ""), x + widths[i] / 2, H + 14);
      x += widths[i];
    });
  }, [img, JSON.stringify(boxes), clues.join(","), [...unsure].join(",")]);
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <canvas ref={ref} width={total} height={H + 18} style={{ display: "block" }} />
    </div>
  );
}

function CreatePanel({
  ready, blockedBy, width, height, rowClues, colClues, onContradiction,
}: {
  ready: boolean;
  blockedBy: string | null;
  width: number;
  height: number;
  rowClues: number[][];
  colClues: number[][];
  onContradiction: () => Promise<void>;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [srcCollection, setSrcCollection] = useState("");
  const [special, setSpecial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gateTimedOut, setGateTimedOut] = useState(false);

  useEffect(() => {
    listCollections().then((r) => setCollections(creationTargets(sortCollections(r.collections)))).catch(() => {});
  }, []);

  async function submit(allowUnverified: boolean) {
    setError(null);
    setSuccess(null);
    setGateTimedOut(false);
    if (!difficulty) {
      setError("Difficulty is required");
      return;
    }
    // Never send clues line logic proves contradictory.
    const p = propagate(rowClues, colClues);
    if (p.contradiction) {
      setError("The clues contradict each other; see the suspect line under Check and fix.");
      await onContradiction();
      return;
    }
    setSubmitting(true);
    try {
      const res = await createPuzzle({
        puzzleType: 6,
        difficulty: Number(difficulty),
        canonRepr: { rowClues, colClues },
        title: title.trim() || undefined,
        author: author.trim() || undefined,
        width,
        height,
        ...(srcCollection ? { srcCollection: Number(srcCollection) } : {}),
        special,
        ...(allowUnverified ? { allowUnverified: true } : {}),
      });
      setSuccess(allowUnverified ? `Created unverified (id: ${res.id}), listed under flagged puzzles` : `Created (id: ${res.id})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setGateTimedOut(isGateTimeout(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>4. Create the question</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
        <label style={fieldStyle}>Title<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label style={fieldStyle}>Author<input style={inputStyle} value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
        <label style={fieldStyle}>Difficulty
          <select style={inputStyle} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">— Select —</option>
            {DIFFICULTY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>Source collection
          <select style={inputStyle} value={srcCollection} onChange={(e) => setSrcCollection(e.target.value)}>
            <option value="">— None —</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", margin: "0.75rem 0" }}>
        <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} /> Special
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button disabled={!ready || submitting} onClick={() => submit(false)}>
          {submitting ? "Creating…" : `Create ${width}×${height} nonogram`}
        </button>
        {gateTimedOut && <OverrideGateButton onClick={() => submit(true)} disabled={submitting} />}
        {blockedBy && <span style={errorStyle}>Can't create yet: {blockedBy}</span>}
      </div>
      {error && <p style={errorStyle}>{error}</p>}
      {success && <p style={{ color: "#2e7d32" }}>{success}</p>}
    </section>
  );
}
