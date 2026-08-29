import { useRef, useState, useLayoutEffect, useEffect, useCallback, type ReactNode } from "react";

/**
 * Wraps a fixed-viewBox SVG board and gives it two sizing modes:
 *
 *  - "fit": the whole board is scaled to the container width (the legacy
 *    behavior). Good for small boards and phones.
 *  - "pan": cells render at a fixed pixel size and the board scrolls inside a
 *    viewport. Good for giant boards on laptop/tablet, where fitting everything
 *    on screen would shrink cells past legibility.
 *
 * `width`/`height` are the intrinsic SVG viewBox dimensions. `focusPoint` (in
 * those same viewBox units) is kept scrolled into view in pan mode — the board
 * passes its selected-cell center so keyboard navigation follows along.
 */
export interface BoardViewportProps {
  width: number;
  height: number;
  /** Intrinsic viewBox cell size, used to decide the auto default mode. */
  cellSize?: number;
  focusPoint?: { x: number; y: number } | null;
  children: ReactNode;
  svgStyle?: React.CSSProperties;
}

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
// If fitting the board to the container would shrink a cell below this many
// screen pixels, default to pan mode instead.
const MIN_COMFORTABLE_CELL_PX = 26;
// Rendered cell size (px) targeted when we first drop into pan mode.
const DEFAULT_PAN_CELL_PX = 34;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export default function BoardViewport({
  width,
  height,
  cellSize = 40,
  focusPoint,
  children,
  svgStyle,
}: BoardViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"fit" | "pan">("fit");
  const [zoom, setZoom] = useState(DEFAULT_PAN_CELL_PX / cellSize);
  const [modeDecided, setModeDecided] = useState(false);

  // Anchor for zoom-to-point: after a zoom change re-renders the SVG at its new
  // size, restore scroll so the intrinsic point stays under the cursor/pinch.
  const zoomAnchor = useRef<{ ix: number; iy: number; ox: number; oy: number } | null>(null);

  // Decide the initial mode once we know the container width.
  useLayoutEffect(() => {
    if (modeDecided) return;
    const el = scrollRef.current;
    if (!el) return;
    const avail = el.clientWidth;
    if (avail <= 0) return;
    const fitScale = avail / width;
    if (fitScale * cellSize < MIN_COMFORTABLE_CELL_PX) {
      setMode("pan");
    }
    setModeDecided(true);
  }, [modeDecided, width, cellSize]);

  // Apply pending zoom anchor after the SVG has re-rendered at the new zoom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = zoomAnchor.current;
    if (!el || !a) return;
    el.scrollLeft = a.ix * zoom - a.ox;
    el.scrollTop = a.iy * zoom - a.oy;
    zoomAnchor.current = null;
  }, [zoom]);

  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = scrollRef.current;
      setZoom((prev) => {
        const next = clampZoom(prev * factor);
        if (next === prev) return prev;
        if (el) {
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
      setMode("pan");
    },
    []
  );

  // Ctrl/⌘ + wheel to zoom (also fires for Mac trackpad pinch). Native listener
  // so we can preventDefault the browser's page zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomBy(factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Two-pointer pinch for touch. Native scroll still handles single-finger pan.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null);

  const pointerDist = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinchStart.current = {
        dist: pointerDist(),
        zoom,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = pinchStart.current;
    if (start && pointers.current.size >= 2) {
      e.preventDefault();
      const dist = pointerDist();
      if (dist > 0 && start.dist > 0) {
        const target = clampZoom(start.zoom * (dist / start.dist));
        // Re-anchor against the pinch midpoint each move for stable zooming.
        zoomBy(target / zoom, start.cx, start.cy);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  // Keep the focused cell scrolled into view (keyboard navigation).
  useEffect(() => {
    if (mode !== "pan" || !focusPoint) return;
    const el = scrollRef.current;
    if (!el) return;
    const px = focusPoint.x * zoom;
    const py = focusPoint.y * zoom;
    const margin = 48;
    let left = el.scrollLeft;
    let top = el.scrollTop;
    if (px < el.scrollLeft + margin) left = px - margin;
    else if (px > el.scrollLeft + el.clientWidth - margin) left = px - el.clientWidth + margin;
    if (py < el.scrollTop + margin) top = py - margin;
    else if (py > el.scrollTop + el.clientHeight - margin) top = py - el.clientHeight + margin;
    if (left !== el.scrollLeft || top !== el.scrollTop) {
      el.scrollTo({ left, top, behavior: "smooth" });
    }
  }, [focusPoint, mode, zoom]);

  const toggleMode = () =>
    setMode((m) => {
      setModeDecided(true);
      return m === "fit" ? "pan" : "fit";
    });

  const isPan = mode === "pan";
  const svgWidth = isPan ? `${width * zoom}px` : "100%";
  const svgHeight = isPan ? `${height * zoom}px` : undefined;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={btnStyle} onClick={toggleMode}>
          {isPan ? "Fit to screen" : "Pan & zoom"}
        </button>
        {isPan && (
          <>
            <button type="button" style={btnStyle} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
              −
            </button>
            <span style={{ fontSize: 13, color: "#475569", minWidth: 44, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" style={btnStyle} onClick={() => zoomBy(1.2)} aria-label="Zoom in">
              +
            </button>
            <button type="button" style={btnStyle} onClick={() => setZoom(DEFAULT_PAN_CELL_PX / cellSize)}>
              Reset
            </button>
          </>
        )}
      </div>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          overflow: isPan ? "auto" : "visible",
          maxHeight: isPan ? "78vh" : undefined,
          maxWidth: isPan ? "100%" : width,
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          background: "#f8fafc",
          touchAction: "pan-x pan-y",
          margin: isPan ? undefined : "0 auto",
        }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            display: "block",
            userSelect: "none",
            ...(isPan ? {} : { width: "100%" }),
            ...svgStyle,
          }}
        >
          {children}
        </svg>
      </div>
    </div>
  );
}
