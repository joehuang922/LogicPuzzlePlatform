import { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { PuzzleType, Collection } from "../api/client";
import { DIFFICULTY_OPTIONS } from "../constants";
import { inputStyle, fieldStyle } from "../styles/admin";
import NurimazeEditor from "./NurimazeEditor";
import SudokuEditor from "./SudokuEditor";
import ComboSudokuEditor from "./ComboSudokuEditor";
import DoubleChocoEditor from "./DoubleChocoEditor";
import SlitherlinkEditor from "./SlitherlinkEditor";
import NonogramEditor from "./NonogramEditor";
import MasyuEditor from "./MasyuEditor";
import PencilsEditor from "./PencilsEditor";
import NuritwinEditor from "./NuritwinEditor";
import SlalomEditor from "./SlalomEditor";
import ShakashakaEditor from "./ShakashakaEditor";
import KakuroEditor from "./KakuroEditor";
import YajilinEditor from "./YajilinEditor";
import FillominoEditor from "./FillominoEditor";
import LitsEditor from "./LitsEditor";
import ChocoBananaEditor from "./ChocoBananaEditor";
import NumberLinkEditor from "./NumberLinkEditor";
import AkariEditor from "./AkariEditor";
import HellGolfEditor from "./HellGolfEditor";
import TentaishowEditor from "./TentaishowEditor";
import HeyawakeEditor from "./HeyawakeEditor";
import ShikakuEditor from "./ShikakuEditor";
import NorinoriEditor from "./NorinoriEditor";
import NurikabeEditor from "./NurikabeEditor";
import RippleEffectEditor from "./RippleEffectEditor";

// Puzzle types that have a visual board editor.
export const EDITOR_TYPE_NAMES = [
  "nurimaze", "sudoku", "combo-sudoku", "double-choco", "slitherlink", "nonogram",
  "masyu", "pencils", "nuritwin", "slalom", "shakashaka", "kakuro", "yajilin",
  "fillomino", "lits", "choco-banana", "number-link", "akari", "hell-golf",
  "tentaishow", "heyawake", "shikaku", "norinori", "nurikabe", "ripple-effect",
];

export function hasVisualEditor(typeName: string | undefined): boolean {
  return !!typeName && EDITOR_TYPE_NAMES.includes(typeName);
}

/**
 * Renders the visual board editor for a given puzzle type. Each editor emits its
 * canonical JSON through `onChange` on every edit (and once on mount).
 */
function CanonEditor({
  typeName,
  canonRepr,
  onChange,
}: {
  typeName: string | undefined;
  canonRepr: string;
  onChange: (json: string) => void;
}) {
  switch (typeName) {
    case "nurimaze": return <NurimazeEditor initialJson={canonRepr} onChange={onChange} />;
    case "sudoku": return <SudokuEditor initialJson={canonRepr} onChange={onChange} />;
    case "combo-sudoku": return <ComboSudokuEditor initialJson={canonRepr} onChange={onChange} />;
    case "double-choco": return <DoubleChocoEditor initialJson={canonRepr} onChange={onChange} />;
    case "slitherlink": return <SlitherlinkEditor initialCanon={canonRepr} onChange={onChange} />;
    case "nonogram": return <NonogramEditor initialCanon={canonRepr} onChange={onChange} />;
    case "masyu": return <MasyuEditor initialCanon={canonRepr} onChange={onChange} />;
    case "pencils": return <PencilsEditor initialCanon={canonRepr} onChange={onChange} />;
    case "nuritwin": return <NuritwinEditor initialJson={canonRepr} onChange={onChange} />;
    case "slalom": return <SlalomEditor initialCanon={canonRepr} onChange={onChange} />;
    case "shakashaka": return <ShakashakaEditor initialJson={canonRepr} onChange={onChange} />;
    case "kakuro": return <KakuroEditor initialCanon={canonRepr} onChange={onChange} />;
    case "yajilin": return <YajilinEditor initialCanon={canonRepr} onChange={onChange} />;
    case "fillomino": return <FillominoEditor initialJson={canonRepr} onChange={onChange} />;
    case "lits": return <LitsEditor initialJson={canonRepr} onChange={onChange} />;
    case "choco-banana": return <ChocoBananaEditor initialJson={canonRepr} onChange={onChange} />;
    case "number-link": return <NumberLinkEditor initialCanon={canonRepr} onChange={onChange} />;
    case "akari": return <AkariEditor initialJson={canonRepr} onChange={onChange} />;
    case "hell-golf": return <HellGolfEditor initialCanon={canonRepr} onChange={onChange} />;
    case "tentaishow": return <TentaishowEditor initialJson={canonRepr} onChange={onChange} />;
    case "heyawake": return <HeyawakeEditor initialJson={canonRepr} onChange={onChange} />;
    case "shikaku": return <ShikakuEditor initialJson={canonRepr} onChange={onChange} />;
    case "norinori": return <NorinoriEditor initialJson={canonRepr} onChange={onChange} />;
    case "nurikabe": return <NurikabeEditor initialJson={canonRepr} onChange={onChange} />;
    case "ripple-effect": return <RippleEffectEditor initialJson={canonRepr} onChange={onChange} />;
    default: return null;
  }
}

/**
 * Shows the original scan for side-by-side proofreading. Source images are
 * high-resolution scans (often 2000px+ wide), so by default the whole image is
 * scaled to *fit* the pane — that's the glance editors want. From there you can
 * zoom in (buttons or Ctrl/⌘ + wheel) and drag to pan around the enlarged image.
 */
function ImagePane({
  imageUrl,
  fillHeight,
  onOrientation,
}: {
  imageUrl: string;
  /** true = image is beside the editor (portrait); false = stacked below (landscape). */
  fillHeight: boolean;
  onOrientation: (o: "portrait" | "landscape") => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // zoom 1 = "fit to pane"; larger zooms in. Panning is only possible above fit.
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  // Pending scroll to apply after the resized <img> lands, so a zoomed-in point
  // stays under the cursor (same pattern as BoardViewport).
  const zoomAnchor = useRef<{ ix: number; iy: number; ox: number; oy: number } | null>(null);

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 8;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    onOrientation(img.naturalWidth > img.naturalHeight ? "landscape" : "portrait");
  }

  // Track the scroll box's content size so we can compute the fit scale.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "Fit" scale: shrink the whole image to sit inside the box (never upscale
  // past 1:1 at fit). Displayed size = fit * zoom.
  const fitScale =
    natural && box.w > 0 && box.h > 0
      ? Math.min(box.w / natural.w, box.h / natural.h, 1)
      : 0;
  const dispW = natural ? natural.w * fitScale * zoom : 0;
  const dispH = natural ? natural.h * fitScale * zoom : 0;

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = boxRef.current;
    setZoom((prev) => {
      const next = clampZoom(prev * factor);
      if (next === prev) return prev;
      if (el) {
        // Record the intrinsic point under the cursor; restore it post-render.
        const rect = el.getBoundingClientRect();
        const ox = clientX != null ? clientX - rect.left : el.clientWidth / 2;
        const oy = clientY != null ? clientY - rect.top : el.clientHeight / 2;
        zoomAnchor.current = {
          ix: (el.scrollLeft + ox) / prev,
          iy: (el.scrollTop + oy) / prev,
          ox,
          oy,
        };
      }
      return next;
    });
  }, []);

  // Ctrl/⌘ + wheel to zoom (also Mac trackpad pinch). Native listener so we can
  // preventDefault the browser's page zoom.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Apply the pending zoom anchor once the image has re-rendered at the new size.
  useLayoutEffect(() => {
    const el = boxRef.current;
    const a = zoomAnchor.current;
    if (!el) return;
    if (a) {
      el.scrollLeft = a.ix * zoom - a.ox;
      el.scrollTop = a.iy * zoom - a.oy;
      zoomAnchor.current = null;
    } else if (zoom === 1) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }, [zoom]);

  function onPointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return; // nothing to pan when fitted
    const el = boxRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    panStart.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  }
  function onPointerMove(e: React.PointerEvent) {
    const start = panStart.current;
    const el = boxRef.current;
    if (!start || !el) return;
    el.scrollLeft = start.left - (e.clientX - start.x);
    el.scrollTop = start.top - (e.clientY - start.y);
  }
  function onPointerUp(e: React.PointerEvent) {
    panStart.current = null;
    boxRef.current?.releasePointerCapture(e.pointerId);
  }

  const zoomed = zoom > 1;

  const btnStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    background: "white",
    borderRadius: 6,
    padding: "2px 9px",
    fontSize: 13,
    cursor: "pointer",
    lineHeight: 1.4,
  };

  return (
    <div
      style={{
        // Definite basis in both orientations so the fitted image (and the
        // zoom percentages) resolve against a stable pane size: a fraction of
        // the row width when beside the editor, of the column height when below.
        flex: fillHeight ? "0 0 42%" : "0 0 40%",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        border: "1px solid #ddd",
        borderRadius: 6,
        background: "#fafafa",
        padding: "0.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "0.35rem", flexShrink: 0 }}>
        <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#666" }}>Original image</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" style={btnStyle} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" disabled={zoom <= ZOOM_MIN}>
            −
          </button>
          <span style={{ fontSize: 12, color: "#475569", minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button type="button" style={btnStyle} onClick={() => zoomBy(1.25)} aria-label="Zoom in" disabled={zoom >= ZOOM_MAX}>
            +
          </button>
          <button type="button" style={btnStyle} onClick={() => setZoom(1)} disabled={zoom === 1}>
            Fit
          </button>
        </div>
      </div>
      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={zoomed ? "Drag to pan" : natural ? `${natural.w}×${natural.h}px — Ctrl/⌘ + scroll to zoom` : undefined}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: zoomed ? "auto" : "hidden",
          display: "flex",
          // At fit, center the (contained) image; when zoomed, pin to top-left
          // so the scrollable content fills the box with no dead margins.
          alignItems: zoomed ? "flex-start" : "center",
          justifyContent: zoomed ? "flex-start" : "center",
          touchAction: "none",
          cursor: zoomed ? "grab" : "default",
        }}
      >
        <img
          src={imageUrl}
          alt="Original puzzle"
          onLoad={handleLoad}
          draggable={false}
          style={{
            display: "block",
            userSelect: "none",
            flex: "none",
            width: dispW ? `${dispW}px` : "auto",
            height: dispH ? `${dispH}px` : "auto",
            maxWidth: dispW ? "none" : "100%",
            maxHeight: dispH ? "none" : "100%",
            objectFit: "contain",
          }}
        />
      </div>
    </div>
  );
}

export interface PuzzleEditorResult {
  canonRepr: string;
  title: string;
  author: string;
  difficulty: number;
  srcCollection: number | null;
}

export interface PuzzleEditorModalProps {
  puzzleType: number;
  puzzleTypes: PuzzleType[];
  /** Original source image to compare against. Omit for saved puzzles with no image. */
  imageUrl?: string;
  initialCanon: string;
  initialTitle?: string;
  initialAuthor?: string;
  initialDifficulty: number;
  initialSrcCollection?: number | null;
  /** When provided, a collection picker is shown. */
  collections?: Collection[];
  showAuthor?: boolean;
  showCollection?: boolean;
  onDone: (result: PuzzleEditorResult) => void;
  onCancel: () => void;
}

export default function PuzzleEditorModal({
  puzzleType,
  puzzleTypes,
  imageUrl,
  initialCanon,
  initialTitle = "",
  initialAuthor = "",
  initialDifficulty,
  initialSrcCollection = null,
  collections,
  showAuthor = true,
  showCollection = true,
  onDone,
  onCancel,
}: PuzzleEditorModalProps) {
  const typeName = puzzleTypes.find((pt) => pt.id === puzzleType)?.name;
  const typeLabel = puzzleTypes.find((pt) => pt.id === puzzleType)?.jpLabel ?? typeName ?? "";

  const [canon, setCanon] = useState(initialCanon);
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [srcCollection, setSrcCollection] = useState<number | null>(initialSrcCollection);
  const [copied, setCopied] = useState(false);
  // "portrait" (image left / editor right) vs "landscape" (editor top / image bottom).
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  const handleCanonChange = useCallback((json: string) => setCanon(json), []);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(canon);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function handleDone() {
    onDone({ canonRepr: canon, title, author, difficulty, srcCollection });
  }

  const hasImage = !!imageUrl;
  const isRow = !hasImage || orientation === "portrait";

  const imagePane = hasImage && (
    <ImagePane imageUrl={imageUrl!} fillHeight={orientation === "portrait"} onOrientation={setOrientation} />
  );

  const editorPane = (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "auto",
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: "0.75rem",
        background: "#fff",
        ...(hasImage ? {} : { maxWidth: 720, margin: "0 auto" }),
      }}
    >
      <CanonEditor typeName={typeName} canonRepr={canon} onChange={handleCanonChange} />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "2vh 2vw",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          width: "96vw",
          height: "96vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: basic fields */}
        <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid #eee", background: "#f8fbff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Edit {typeLabel}</h3>
            <button
              type="button"
              onClick={onCancel}
              style={{ border: "none", background: "transparent", fontSize: "1.4rem", lineHeight: 1, cursor: "pointer", color: "#888" }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={fieldStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Title</label>
              <input style={{ ...inputStyle, width: 200 }} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Difficulty</label>
              <select style={{ ...inputStyle, width: 140 }} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            {showAuthor && (
              <div style={fieldStyle}>
                <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Author</label>
                <input style={{ ...inputStyle, width: 160 }} value={author} onChange={(e) => setAuthor(e.target.value)} />
              </div>
            )}
            {showCollection && collections && (
              <div style={fieldStyle}>
                <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Collection</label>
                <select style={{ ...inputStyle, width: 200 }} value={srcCollection ?? ""} onChange={(e) => setSrcCollection(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— None —</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Body: image + editor comparison */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: isRow ? "row" : "column",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            overflow: "hidden",
          }}
        >
          {orientation === "landscape" && hasImage ? (
            <>
              {editorPane}
              {imagePane}
            </>
          ) : (
            <>
              {imagePane}
              {editorPane}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid #eee", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{ padding: "0.4rem 0.9rem", fontSize: "0.8rem", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
          >
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{ padding: "0.5rem 1.25rem", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDone}
              style={{ padding: "0.5rem 1.5rem", background: "#4a90d9", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
