import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBoardUiMemory, useBoardUiState } from "../hooks/useBoardUiState";

/**
 * Button-based zoom for any board on the Play page, whatever it renders.
 *
 *  - "Fit" (default): the board lays out exactly as it always has, fitted to the page.
 *  - "Pan & zoom": the board keeps its fitted layout but is scaled by a CSS transform
 *    inside a scrolling frame, with − / % / + / Reset buttons and Ctrl/⌘ + wheel
 *    (also a Mac trackpad pinch). 100% is the fitted size.
 *
 * A transform rather than a re-layout because boards size themselves (an SVG at 100%
 * width capped at its natural size, extra panels, word lists); scaling the rendered box
 * works for all of them, and boards map pointers through getBoundingClientRect /
 * getScreenCTM, which include the transform. Anything a board pins to the screen
 * (DigitBar) is portalled out so the transform doesn't move it.
 *
 * The element tree is the same in both modes, so switching never remounts the board
 * (which would drop the player's unsaved marks). Mode, zoom and scroll live in the board
 * UI memory, so they survive undo/redo remounts.
 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;
const DEFAULT_ZOOM = 1.5;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export default function ZoomFrame({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const [mode, setMode] = useBoardUiState<"fit" | "pan">("frame.mode", "fit");
  const [zoom, setZoom] = useBoardUiState("frame.zoom", DEFAULT_ZOOM);
  const memory = useBoardUiMemory();
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Fitted layout size of the board (width of the page column, height it takes there).
  const [base, setBase] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const isPan = !disabled && mode === "pan";

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;
    const measure = () => setBase({ w: outer.clientWidth, h: content.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // Keep the point under the cursor (or the frame centre) fixed across a zoom change.
  const anchor = useRef<{ ix: number; iy: number; ox: number; oy: number } | null>(null);
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    setZoom((prev) => {
      const next = clampZoom(prev * factor);
      if (next === prev) return prev;
      if (el) {
        const rect = el.getBoundingClientRect();
        const ox = clientX != null ? clientX - rect.left : el.clientWidth / 2;
        const oy = clientY != null ? clientY - rect.top : el.clientHeight / 2;
        anchor.current = { ix: (el.scrollLeft + ox) / prev, iy: (el.scrollTop + oy) / prev, ox, oy };
      }
      return next;
    });
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = a.ix * zoom - a.ox;
    el.scrollTop = a.iy * zoom - a.oy;
    anchor.current = null;
  }, [zoom]);

  // Restore the remembered scroll on mount; remember it as the player scrolls.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = memory?.get("frame.scroll") as { left: number; top: number } | undefined;
    if (el && saved) {
      el.scrollLeft = saved.left;
      el.scrollTop = saved.top;
    }
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/⌘ + wheel zooms in pan mode (native listener, to cancel the page zoom).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isPan) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // zoomBy only touches refs and the stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPan]);

  const btnStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    background: "white",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 13,
    cursor: "pointer",
    lineHeight: 1.4,
  };

  return (
    <div ref={outerRef} style={{ width: "100%" }}>
      {!disabled && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" style={btnStyle} onClick={() => setMode(isPan ? "fit" : "pan")}>
            {isPan ? "Fit to screen" : "Pan & zoom"}
          </button>
          {isPan && (
            <>
              <button type="button" style={btnStyle} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
                −
              </button>
              <span style={{ fontSize: 13, color: "#475569", minWidth: 44, textAlign: "center" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button type="button" style={btnStyle} onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
                +
              </button>
              <button type="button" style={btnStyle} onClick={() => zoomBy(DEFAULT_ZOOM / zoom)}>
                Reset
              </button>
            </>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) memory?.set("frame.scroll", { left: el.scrollLeft, top: el.scrollTop });
        }}
        style={
          isPan
            ? { overflow: "auto", maxHeight: "78vh", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" }
            : undefined
        }
      >
        <div style={isPan ? { position: "relative", width: base.w * zoom, height: base.h * zoom } : undefined}>
          <div
            ref={contentRef}
            style={
              isPan
                ? { position: "absolute", top: 0, left: 0, width: base.w, transform: `scale(${zoom})`, transformOrigin: "0 0" }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
