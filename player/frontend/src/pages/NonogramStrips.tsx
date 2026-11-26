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
  Fix,
  LineId,
  LineResult,
  RepairLine,
  RepairResult,
  StripInput,
  checkClues,
  combineLines,
  lineLabel,
  parseClueText,
  placeStrips,
  propagate,
} from "../utils/nonogramStrips";
import { runLimited, withRetry } from "../utils/runLimited";

/**
 * Big-nonogram strip editor: a board too big for one photo is entered from
 * scans of its clue strips. Built to run on a phone: add the strip images
 * (camera or gallery) and the board size; the page reads every strip, works
 * out which way it lies and where it goes, repairs misreadings the clues
 * themselves prove wrong, and shows the solved picture. A person proofchecks
 * the changes against the scan, settles anything the repair couldn't, and
 * creates the question.
 */

// The deployed parser has 2 minutes per request and ~1.7 vCPU: a strip is
// read by this many requests at once, each taking a share of its lines.
const SHARES = PARSER_IS_LOCAL ? 1 : 4;
// All the account's Lambdas share a concurrency cap of 10.
const IN_FLIGHT = PARSER_IS_LOCAL ? 2 : 4;
// Lambda Function URLs take at most 6 MB per request.
const MAX_BASE64 = 4_500_000;
// Phone browsers refuse canvases much over 16 megapixels.
const MAX_CANVAS_AREA = 16_000_000;

interface StripItem {
  id: string;
  name: string;
  url: string; // object URL for display and crops
  base64: string;
  /** Uploaded-image pixels per pixel sent to the parser (boxes come back in the latter). */
  scale: number;
  width: number;
  height: number;
  orientation: Axis;
  /** Orientation guessed from the shape (not set by a person): may be flipped once if the parser can't read it. */
  guessed: boolean;
  flipped: boolean;
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
  auto: "#ab47bc",
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

/**
 * The image as base64 JPEG for the parser. Sent as is when small enough;
 * otherwise re-encoded, scaled down only as far as a phone's canvas limit
 * (and then the request size) needs.
 */
async function encodeForParser(file: File, img: HTMLImageElement): Promise<{ base64: string; scale: number }> {
  const original = extractBase64(
    await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    }),
  );
  const w = img.naturalWidth, h = img.naturalHeight;
  // A phone photo's EXIF rotation is applied by the browser but not by the
  // parser: re-encode those too, so both see the same upright pixels.
  const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  if (original.length <= MAX_BASE64 && w * h <= MAX_CANVAS_AREA && !(isJpeg && (await hasExifRotation(file)))) {
    return { base64: original, scale: 1 };
  }
  let shrink = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (w * h)));
  for (let attempt = 0; attempt < 4; attempt++, shrink *= 0.85) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * shrink);
    canvas.height = Math.round(h * shrink);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.92, 0.85, 0.78]) {
      const b64 = extractBase64(canvas.toDataURL("image/jpeg", q));
      if (b64.length <= MAX_BASE64) return { base64: b64, scale: w / canvas.width };
    }
  }
  throw new Error("Image too large to send, even re-compressed: crop it closer to the clues");
}

/** A JPEG whose EXIF orientation tag asks for a turn or flip (tag value 2–8). */
async function hasExifRotation(file: File): Promise<boolean> {
  const buf = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
  if (buf.byteLength < 4 || buf.getUint16(0) !== 0xffd8) return false;
  let off = 2;
  while (off + 4 <= buf.byteLength) {
    const marker = buf.getUint16(off);
    const size = buf.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= buf.byteLength && buf.getUint32(off + 4) === 0x45786966) {
      const t = off + 10; // TIFF header
      if (t + 8 > buf.byteLength) return false;
      const le = buf.getUint16(t) === 0x4949;
      const ifd = t + buf.getUint32(t + 4, le);
      if (ifd + 2 > buf.byteLength) return false;
      const n = buf.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > buf.byteLength) return false;
        if (buf.getUint16(e, le) === 0x0112) return buf.getUint16(e + 8, le) > 1;
      }
      return false;
    }
    if ((marker & 0xff00) !== 0xff00) return false;
    off += 2 + size;
  }
  return false;
}

let nextId = 1;

interface RepairState {
  key: string;
  progress: string | null;
  result: RepairResult | null;
  error?: string;
}

const lineId = (axis: Axis, index: number) => `${axis === "rows" ? "r" : "c"}${index}` as LineId;

export default function NonogramStrips() {
  const isMobile = useIsMobile();
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [stableSize, setStableSize] = useState("");
  const [strips, setStrips] = useState<StripItem[]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [edits, setEdits] = useState<Record<Axis, Map<number, number[]>>>({ rows: new Map(), cols: new Map() });
  const [axisView, setAxisView] = useState<Axis>("rows");
  const [problemsOnly, setProblemsOnly] = useState(true);
  const [repair, setRepair] = useState<RepairState | null>(null);
  const [adding, setAdding] = useState(0);

  const W = Number(width) || 0;
  const H = Number(height) || 0;
  const sizeOk = W > 0 && H > 0;
  const sizeKey = `${W}x${H}`;

  // Strips are read with the line length as the largest possible clue: wait
  // until the size stops changing (typing "175" passes through "1" and "17").
  useEffect(() => {
    const t = setTimeout(() => setStableSize(sizeKey), 900);
    return () => clearTimeout(t);
  }, [sizeKey]);

  const update = (id: string, patch: Partial<StripItem>) =>
    setStrips((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    setAdding((n) => n + list.length);
    for (const file of list) {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const { base64, scale } = await encodeForParser(file, img);
        const id = `s${nextId++}`;
        images.current.set(id, img);
        setStrips((ss) => [
          ...ss,
          {
            id, name: file.name, url, base64, scale,
            width: img.naturalWidth, height: img.naturalHeight,
            // Row clue strips are usually taller than wide, column strips wider.
            orientation: img.naturalWidth > img.naturalHeight ? "cols" : "rows",
            guessed: true, flipped: false,
            status: "idle", sharesDone: 0, manualOffset: null,
          },
        ]);
      } catch (e) {
        URL.revokeObjectURL(url);
        alert(`${file.name}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setAdding((n) => n - 1);
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
            if (x.id !== s.id || x.status !== "reading" || x.orientation !== s.orientation) return x;
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
        if (failed.has(s.id)) return;
        failed.add(s.id);
        const status = (e as { status?: number }).status;
        const msg = e instanceof Error ? e.message : String(e);
        setStrips((ss) =>
          ss.map((x) => {
            if (x.id !== s.id || x.orientation !== s.orientation) return x;
            // No grid found the way we guessed: try the strip the other way once.
            if (status === 422 && x.guessed && !x.flipped) {
              return { ...x, orientation: x.orientation === "rows" ? "cols" : "rows", flipped: true, status: "idle", sharesDone: 0, error: undefined };
            }
            return {
              ...x,
              status: "error",
              error: status === 422 ? `${msg} — is it a clue strip, with a few board cells showing?` : msg,
            };
          }),
        );
      }
    });
  }

  // Read new strips as soon as the board size is known and settled.
  useEffect(() => {
    if (!sizeOk || stableSize !== sizeKey) return;
    const idle = strips.filter((s) => s.status === "idle");
    if (idle.length) readStrips(idle);
  }, [strips, sizeOk, stableSize, sizeKey]);

  // --- merge ------------------------------------------------------------------
  const inputs = useMemo(() => {
    const out = {} as Record<Axis, StripInput[]>;
    for (const axis of ["rows", "cols"] as Axis[]) {
      out[axis] = strips
        .filter((s) => s.orientation === axis && s.status === "done" && s.lines)
        .map((s) => ({
          id: s.id, lines: s.lines!, thick: s.thick ?? [],
          startBorder: !!s.startBorder, endBorder: !!s.endBorder, manualOffset: s.manualOffset,
        }));
    }
    return out;
  }, [strips]);

  const placements = useMemo(
    () => ({ rows: placeStrips(inputs.rows, H), cols: placeStrips(inputs.cols, W) }),
    [inputs, W, H],
  );

  // What the strips and a person say, before the automatic repair.
  const baseLines = useMemo(
    () => ({
      rows: H ? combineLines(inputs.rows, placements.rows, H, edits.rows) : [],
      cols: W ? combineLines(inputs.cols, placements.cols, W, edits.cols) : [],
    }),
    [inputs, placements, edits, W, H],
  );

  const busy = adding > 0 || strips.some((s) => s.status === "reading" || s.status === "idle");
  const repairReady = sizeOk && !busy && inputs.rows.length > 0 && inputs.cols.length > 0;
  const repairInput = useMemo(() => {
    if (!repairReady) return null;
    const toRepair = (l: LineResult): RepairLine => {
      const readings = [...new Map(l.readings.map((r) => [r.clues.join(","), r.clues])).values()];
      return {
        clues: l.clues,
        readings,
        alternates: readings.length === 1 ? l.readings.flatMap((r) => r.alternates) : [],
        doubtful: l.status === "flagged" || l.status === "conflict" || l.readings.some((r) => r.alternates.length > 0),
        locked: l.status === "edited",
      };
    };
    return { rows: baseLines.rows.map(toRepair), cols: baseLines.cols.map(toRepair) };
  }, [repairReady, baseLines]);
  const repairKey = repairInput ? JSON.stringify(repairInput) : "";

  // Run the repair in a worker whenever the readings or edits change.
  useEffect(() => {
    if (!repairInput) return;
    const key = repairKey;
    const w = new Worker(new URL("../workers/nonogramRepair.worker.ts", import.meta.url), { type: "module" });
    setRepair({ key, progress: "checking the clues…", result: null });
    w.onmessage = (e: MessageEvent<{ progress?: string; result?: RepairResult; error?: string }>) => {
      if (e.data.progress) setRepair((r) => (r && r.key === key ? { ...r, progress: e.data.progress! } : r));
      else {
        setRepair({ key, progress: null, result: e.data.result ?? null, error: e.data.error });
        w.terminate();
      }
    };
    w.onerror = (e) => {
      setRepair({ key, progress: null, result: null, error: e.message || "the check failed" });
      w.terminate();
    };
    w.postMessage(repairInput);
    return () => w.terminate();
  }, [repairKey]);

  const current = repair && repair.key === repairKey ? repair : null;
  const result = current?.result ?? null;
  const applied = result && result.kind !== "stuck" ? result.fixes : [];
  const autos = useMemo(() => {
    const m: Record<Axis, Map<number, number[]>> = { rows: new Map(), cols: new Map() };
    for (const f of applied) m[f.id[0] === "r" ? "rows" : "cols"].set(Number(f.id.slice(1)), f.to);
    return m;
  }, [result]);

  const lines = useMemo(
    () => ({
      rows: H ? combineLines(inputs.rows, placements.rows, H, edits.rows, autos.rows) : [],
      cols: W ? combineLines(inputs.cols, placements.cols, W, edits.cols, autos.cols) : [],
    }),
    [inputs, placements, edits, autos, W, H],
  );

  const rowClues = lines.rows.map((l) => l.clues);
  const colClues = lines.cols.map((l) => l.clues);
  const allRead = sizeOk && [...rowClues, ...colClues].every((c) => c !== null);
  const checks: Check[] = sizeOk ? checkClues(lines.rows, lines.cols) : [];
  const formatOk = sizeOk && checks.every((c) => c.ok || !c.blocking);
  const solved = result?.kind === "solved";

  function setEdit(axis: Axis, index: number, clues: number[] | null) {
    setEdits((e) => {
      const m = new Map(e[axis]);
      if (clues) m.set(index, clues);
      else m.delete(index);
      return { ...e, [axis]: m };
    });
  }

  const suspectSet = new Set(result?.kind === "stuck" ? result.suspects : []);
  const optionsFor = (id: LineId) => (result?.kind === "stuck" ? result.options.filter((o) => o.id === id) : []);
  const fixFor = (id: LineId) => applied.find((f) => f.id === id);
  const isProblem = (axis: Axis, l: LineResult) => {
    if (suspectSet.has(lineId(axis, l.index))) return true;
    if (l.status === "ok" || l.status === "auto") return false; // auto fixes are listed with the result
    // A solved board proves its doubtful readings right.
    return !(solved && l.status === "flagged");
  };
  const shown = lines[axisView].filter((l) => !problemsOnly || isProblem(axisView, l));
  const lineRow = (axis: Axis, l: LineResult) => {
    const id = lineId(axis, l.index);
    return (
      <LineRow
        key={id}
        axis={axis}
        line={l}
        suspect={suspectSet.has(id)}
        fix={fixFor(id)}
        options={optionsFor(id)}
        strips={strips}
        images={images.current}
        onEdit={(clues) => setEdit(axis, l.index, clues)}
      />
    );
  };
  const anyDone = strips.some((s) => s.status === "done");

  return (
    <div>
      <p><Link to="/admin">← Admin</Link></p>
      <h1 style={isMobile ? { fontSize: "1.4rem" } : undefined}>Big nonogram from clue strips</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        For a board too big for one photo: scan its row clues and column clues in strips, each showing a
        few board cells next to the clues. The page reads them, fixes what the clues prove misread, and
        leaves you the proofcheck.
      </p>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>1. Board size</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label style={{ ...fieldStyle, flex: 1, minWidth: 120 }}>Columns (width)
            <input style={inputStyle} type="number" inputMode="numeric" min={1} value={width} onChange={(e) => setWidth(e.target.value)} />
          </label>
          <label style={{ ...fieldStyle, flex: 1, minWidth: 120 }}>Rows (height)
            <input style={inputStyle} type="number" inputMode="numeric" min={1} value={height} onChange={(e) => setHeight(e.target.value)} />
          </label>
        </div>
        {sizeOk && <p style={{ marginBottom: 0, color: "#555" }}>{W} × {H} = {(W * H).toLocaleString()} cells</p>}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>2. Clue strips</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <label style={{ ...buttonLike, ...(isMobile ? bigButton : {}) }}>
            {isMobile ? "Choose scans" : "Add images"}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {isMobile && (
            <label style={{ ...buttonLike, ...bigButton }}>
              Take photo
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
          {strips.some((s) => s.status === "error") && (
            <button onClick={() => readStrips(strips.filter((s) => s.status === "error"))} disabled={!sizeOk}>Retry failed</button>
          )}
        </div>
        {adding > 0 && <p style={{ color: "#555", margin: "0 0 0.5rem" }}>Preparing {adding} image{adding > 1 ? "s" : ""}…</p>}
        {!sizeOk && strips.length > 0 && <p style={errorStyle}>Set the board size: reading starts then.</p>}
        {strips.map((s) => {
          const axisLength = s.orientation === "rows" ? H : W;
          const p = placements[s.orientation].get(s.id);
          return (
            <div key={s.id} style={{ display: "flex", gap: "0.75rem", padding: "0.5rem 0", borderTop: "1px solid #eee", alignItems: "flex-start" }}>
              <img src={s.url} alt="" style={{ width: isMobile ? 64 : 96, height: isMobile ? 64 : 96, objectFit: "contain", background: "#f5f5f5", borderRadius: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ wordBreak: "break-all", fontSize: isMobile ? "0.85rem" : undefined }}>{s.name}</strong>
                  <span style={{ color: "#888", fontSize: "0.8rem" }}>{s.width}×{s.height}</span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                  {(["rows", "cols"] as Axis[]).map((o) => (
                    <button
                      key={o}
                      disabled={s.status === "reading"}
                      onClick={() => s.orientation !== o && update(s.id, { orientation: o, guessed: false, status: "idle", lines: undefined, manualOffset: null, error: undefined })}
                      style={{ fontWeight: s.orientation === o ? 700 : 400, background: s.orientation === o ? "#e3f2fd" : undefined }}
                    >
                      {o === "rows" ? "Row clues" : "Column clues"}
                    </button>
                  ))}
                  <button
                    disabled={s.status === "reading"}
                    onClick={() => { setStrips((ss) => ss.filter((x) => x.id !== s.id)); images.current.delete(s.id); URL.revokeObjectURL(s.url); }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#555" }}>
                  {s.status === "idle" && (sizeOk ? "Waiting to read…" : "Not read yet.")}
                  {s.status === "reading" && `Reading… ${s.sharesDone}/${SHARES}${s.flipped ? " (turned the other way)" : ""}`}
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
                        {s.orientation === "rows" ? "Rows" : "Columns"} {p.offset + 1}–{p.offset + (s.lineCount ?? 0)} of {axisLength}
                        <span style={{ color: "#888" }}> ({p.how}{p.how === "overlap" ? `, ${p.agree} lines agree` : ""})</span>
                      </span>
                    ) : (
                      <span style={{ color: "#c62828" }}>Not placed: {p.note}</span>
                    )}
                    <label style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                      first line
                      <input
                        type="number"
                        inputMode="numeric"
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
        {sizeOk && anyDone && (
          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Coverage label="Rows" lines={lines.rows} />
            <Coverage label="Columns" lines={lines.cols} />
            <Legend />
          </div>
        )}
      </section>

      {sizeOk && anyDone && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>3. Result</h2>
          <ResultSummary
            busy={busy}
            ready={repairReady}
            progress={current?.progress ?? null}
            result={result}
            error={current?.error}
            cells={W * H}
          />
          {result?.grid && <Picture grid={result.grid} width={W} height={H} />}

          {applied.length > 0 && (
            <>
              <h3 style={{ marginBottom: "0.25rem" }}>Changes to proofcheck ({applied.length})</h3>
              <p style={{ color: "#555", marginTop: 0, fontSize: "0.85rem" }}>
                Compare each with the scan cut out above its numbers. If the scan says otherwise, type what it says.
              </p>
              {applied.map((f) => {
                const axis: Axis = f.id[0] === "r" ? "rows" : "cols";
                const l = lines[axis][Number(f.id.slice(1))];
                return l ? lineRow(axis, l) : null;
              })}
            </>
          )}

          <ul style={{ paddingLeft: "1.2rem" }}>
            {checks.map((c) => (
              <li key={c.name} style={{ color: c.ok ? "#2e7d32" : c.blocking ? "#c62828" : solved ? "#2e7d32" : "#b26a00" }}>
                <strong>{c.name}:</strong>{" "}
                {!c.ok && !c.blocking && solved ? `${c.detail.replace(/ with a doubtful reading.*/, "")} doubtful, all confirmed by the solve` : c.detail}
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "1rem 0 0.5rem", flexWrap: "wrap" }}>
            {(["rows", "cols"] as Axis[]).map((a) => (
              <button key={a} onClick={() => setAxisView(a)} style={{ fontWeight: axisView === a ? 700 : 400, background: axisView === a ? "#e3f2fd" : undefined }}>
                {a === "rows" ? "Rows" : "Columns"} ({lines[a].filter((l) => isProblem(a, l)).length})
              </button>
            ))}
            <label style={{ marginLeft: "auto", display: "flex", gap: "0.3rem", alignItems: "center" }}>
              <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} /> problems only
            </label>
          </div>
          {shown.length === 0 && <p style={{ color: "#555" }}>Nothing to look at here.</p>}
          {shown.map((l) => lineRow(axisView, l))}
        </section>
      )}

      {sizeOk && anyDone && (
        <CreatePanel
          ready={formatOk && allRead && !!result && result.kind !== "stuck" && !current?.progress}
          blockedBy={
            busy ? "strips are still being read"
              : !allRead ? "every line must be read"
                : !formatOk ? "fix the red checks first"
                  : !result ? "the check is still running"
                    : result.kind === "stuck" ? "settle the lines the check points at"
                      : null
          }
          width={W}
          height={H}
          rowClues={rowClues as number[][]}
          colClues={colClues as number[][]}
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

const bigButton: React.CSSProperties = { padding: "0.7rem 1rem", fontSize: "1rem", flex: 1, textAlign: "center" };

function ResultSummary({
  busy, ready, progress, result, error, cells,
}: {
  busy: boolean;
  ready: boolean;
  progress: string | null;
  result: RepairResult | null;
  error?: string;
  cells: number;
}) {
  const box = (color: string, children: React.ReactNode) => (
    <div style={{ borderLeft: `4px solid ${color}`, background: `${color}14`, padding: "0.6rem 0.8rem", borderRadius: 4, marginBottom: "0.75rem" }}>
      {children}
    </div>
  );
  if (busy) return box("#757575", "Reading the strips…");
  if (!ready) return box("#757575", "Needs at least one row strip and one column strip.");
  if (error) return box("#c62828", <>The check failed: {error}</>);
  if (progress || !result) return box("#1565c0", <>Checking: {progress ?? "starting…"}</>);
  const changes = result.fixes.length ? ` after ${result.fixes.length} automatic change${result.fixes.length > 1 ? "s" : ""} (below)` : "";
  if (result.kind === "solved")
    return box("#2e7d32", <><strong>Solved{changes}.</strong> Line logic fills all {cells.toLocaleString()} cells with no contradiction, so these clues have exactly one picture.</>);
  if (result.kind === "consistent")
    return box("#b26a00", <><strong>No contradiction{changes},</strong> but line logic settles only {result.settled.toLocaleString()} of {result.total.toLocaleString()} cells; the server's solver checks the rest when you create it. Look the picture over.</>);
  return box("#c62828", <><strong>Needs you:</strong> {result.reason}.{result.suspects.length > 0 && <> Lines: {result.suspects.slice(0, 8).map(lineLabel).join(", ")}{result.suspects.length > 8 ? ", …" : ""}.</>}</>);
}

/** The picture the clues draw: what a misread that slipped through would scar. */
function Picture({ grid, width, height }: { grid: Int8Array; width: number; height: number }) {
  const url = useMemo(() => {
    if (grid.length !== width * height) return null;
    const px = Math.max(2, Math.min(8, Math.floor(1800 / Math.max(width, height))));
    const c = document.createElement("canvas");
    c.width = width * px;
    c.height = height * px;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = grid[y * width + x];
        if (v === 0) continue;
        ctx.fillStyle = v === 1 ? "#212121" : "#ffb74d";
        ctx.fillRect(x * px, y * px, px, px);
      }
    }
    return c.toDataURL("image/png");
  }, [grid, width, height]);
  if (!url) return null;
  return (
    <figure style={{ margin: "0 0 0.75rem" }}>
      <img src={url} alt="The solved picture" style={{ width: "100%", maxWidth: width * 6, imageRendering: "pixelated", border: "1px solid #ccc", display: "block" }} />
      <figcaption style={{ fontSize: "0.8rem", color: "#666" }}>
        The picture the clues draw (orange: cells line logic leaves open). Pinch to zoom.
      </figcaption>
    </figure>
  );
}
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
    ok: "read", auto: "fixed automatically", edited: "edited", flagged: "doubtful reading", conflict: "strips disagree", missing: "no strip covers it",
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
  axis, line, suspect, fix, options, strips, images, onEdit,
}: {
  axis: Axis;
  line: LineResult;
  suspect: boolean;
  fix?: Fix;
  options: Fix[];
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
            likely misread
          </span>
        )}
        <input
          inputMode="decimal"
          style={{ ...inputStyle, flex: 1, minWidth: 160, fontFamily: "monospace", borderColor: draft !== null && !parsed ? "#c62828" : "#ccc" }}
          value={value}
          placeholder="clues, e.g. 3 1 12"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(null); }}
        />
        {line.status === "edited" && <button onClick={() => { setDraft(null); onEdit(null); }}>Undo edit</button>}
      </div>
      {fix && line.status === "auto" && (
        <div style={{ fontSize: "0.85rem", color: "#6a1b9a" }}>
          Read <code>{fix.from ? fix.from.join(" ") : "differently by the strips"}</code>, changed to{" "}
          <code>{fix.to.join(" ")}</code>: {fix.why}.
        </div>
      )}
      {options.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", fontSize: "0.85rem" }}>
          Could be:
          {options.map((o) => (
            <button key={o.to.join(",")} onClick={() => onEdit(o.to)} style={{ fontFamily: "monospace" }}>
              {o.to.join(" ")}
            </button>
          ))}
        </div>
      )}
      {line.readings.map((r) => {
        const strip = strips.find((s) => s.id === r.stripId);
        const img = images.get(r.stripId);
        const unsure = new Set(
          r.flags.filter((f) => f.startsWith("uncertain:")).flatMap((f) => f.slice(10).split(",").map(Number)),
        );
        return (
          <div key={r.stripId} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {img && r.boxes.length > 0 && <CellMosaic img={img} scale={strip?.scale ?? 1} boxes={r.boxes} clues={r.clues} unsure={unsure} />}
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
function CellMosaic({
  img, scale, boxes, clues, unsure,
}: { img: HTMLImageElement; scale: number; boxes: number[][]; clues: number[]; unsure: Set<number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const H = 34;
  // A little of the neighbouring cells shows around each one: a digit the
  // reader's box cut off is then still visible to compare.
  // Boxes are in the pixels sent to the parser; the image shown may be bigger.
  const tiles = boxes.map((b) => b.map((v) => v * scale)).map(([x1, y1, x2, y2]) => {
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
  }, [img, scale, JSON.stringify(boxes), clues.join(","), [...unsure].join(",")]);
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <canvas ref={ref} width={total} height={H + 18} style={{ display: "block" }} />
    </div>
  );
}

function CreatePanel({
  ready, blockedBy, width, height, rowClues, colClues,
}: {
  ready: boolean;
  blockedBy: string | null;
  width: number;
  height: number;
  rowClues: number[][];
  colClues: number[][];
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
      setError("The clues contradict each other; see the lines marked under Result.");
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
