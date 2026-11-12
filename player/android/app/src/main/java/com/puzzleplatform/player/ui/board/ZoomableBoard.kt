package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Largest cell the board is ever drawn at — zooming in stops here. */
private val MAX_CELL = 40.dp
/** Default target: auto-zoom so cells are at least this big when a board opens. */
private val AUTO_CELL = 28.dp
/** Below this, cells are too small to tap/draw reliably, so input is off. */
private val ENTRY_FLOOR = 24.dp

/**
 * The cell the player is typing into while an entry pad (DigitBar / NumberPad) covers
 * the bottom of the screen. [cellKey] is "col,row"; [viewportBottom] is the space the
 * pad takes, so a change in the pad's height re-runs the scroll. Provided by the play
 * screen; every [ZoomableBoard] under it scrolls that cell into view (via the nearest
 * scrollable parent) so a bottom-row cell never ends up behind the pad.
 */
data class EntryFocus(val cellKey: String, val viewportBottom: Dp)

val LocalEntryFocus = compositionLocalOf<EntryFocus?> { null }

/**
 * The tallest a board viewport may be. Boards are square and as wide as their parent,
 * which in landscape is far taller than the screen; the play screen provides the
 * height it has room for and every board caps its side at it, centred in the width.
 * Unbounded (no cap) where nothing provides one, e.g. the admin editors.
 */
val LocalBoardMaxSide = compositionLocalOf { Dp.Infinity }

/** A square board's side: the parent's width, capped by [LocalBoardMaxSide]. */
@Composable
fun boardSide(maxWidth: Dp): Dp {
    val cap = LocalBoardMaxSide.current
    return if (cap < maxWidth) cap else maxWidth
}

/** Extra room kept around the focused cell when scrolling it into view, in cells. */
private const val FOCUS_MARGIN_CELLS = 0.5f

/**
 * A square, two-finger pan/zoom viewport for grid boards, shared by every puzzle
 * renderer. The child draws in board pixel coordinates via [draw], which receives
 * the current cell size in px.
 *
 * Gesture model (see [detectBoardGestures]): one finger is for content — a tap
 * selects a cell via [onTapCell], and a one-finger drag draws (loop/edge puzzles)
 * via [onDrawStart]/[onDrawTo]/[onDrawEnd] when those are supplied; two fingers
 * pan and pinch-zoom. Separating by finger count is what lets drawing boards use
 * the single-finger drag for drawing without fighting the pan.
 *
 * The zoom/pan math lives in [BoardTransform] (unit-tested); this composable only
 * wires gestures and drawing to it. A board small enough to fit at the max cell
 * size (e.g. 9x9 Sudoku on a phone) has no zoom range and simply ignores the
 * two-finger transform.
 *
 * [padCells] reserves a margin (in cells) around the grid; [draw] still draws with the
 * grid's top-left at (0, 0), so the margin lies at negative / beyond-grid coordinates.
 *
 * [resetKey] recomputes the default zoom/pan when it changes (pass the puzzle id).
 * The draw callbacks receive a (col, row) or null when the finger is off-grid /
 * cells are too small to input.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ZoomableBoard(
    cols: Int,
    rows: Int,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    resetKey: Any? = null,
    padCells: Float = 0f,
    // Fractional-coordinate tap, in cell units (e.g. col 1.5 is the right edge of
    // col 1). Fires on the same tap as [onTapCell] for boards that target sub-cell
    // features — a Fillomino wall tap snaps to the nearest interior grid line.
    onTapPrecise: ((col: Float, row: Float) -> Unit)? = null,
    onDrawStart: ((cell: Pair<Int, Int>?) -> Unit)? = null,
    onDrawTo: ((cell: Pair<Int, Int>?) -> Unit)? = null,
    onDrawEnd: (() -> Unit)? = null,
    draw: DrawScope.(cellPx: Float) -> Unit,
) {
    if (cols <= 0 || rows <= 0) return
    val density = LocalDensity.current
    val drawable = onDrawTo != null

    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        val side = boardSide(maxWidth)
        val vpx = with(density) { side.toPx() } // viewport is square: vpx x vpx
        val maxCellPx = with(density) { MAX_CELL.toPx() }
        val autoCellPx = with(density) { AUTO_CELL.toPx() }
        val entryFloorPx = with(density) { ENTRY_FLOOR.toPx() }

        val transform = remember(cols, rows, resetKey, vpx, padCells) {
            BoardTransform(cols, rows, vpx, maxCellPx, autoCellPx, entryFloorPx, padCells)
        }
        // A version counter so gesture-driven mutations to `transform` recompose.
        var version by remember(transform) { mutableStateOf(0) }

        // Scroll the cell being typed into clear of the entry pad. Waits a frame so the
        // layout with the pad (and the smaller viewport it leaves) is in place first.
        val focus = LocalEntryFocus.current
        val focusRequester = remember { BringIntoViewRequester() }
        LaunchedEffect(focus, transform) {
            val (col, row) = focus?.cellKey?.split(",")?.mapNotNull { it.toIntOrNull() }
                ?.takeIf { it.size == 2 && it[0] in 0 until cols && it[1] in 0 until rows }
                ?: return@LaunchedEffect
            withFrameNanos { }
            val (l, t, r, b) = transform.cellBounds(col, row, FOCUS_MARGIN_CELLS)
            focusRequester.bringIntoView(Rect(l, t, r, b))
        }

        val canvasMod = Modifier
            .size(side)
            .bringIntoViewRequester(focusRequester)
            .pointerInput(transform, drawable) {
                detectBoardGestures(
                    transformEnabled = transform.zoomable,
                    drawEnabled = drawable,
                    onTap = { off ->
                    transform.cellAt(off.x, off.y)?.let { (col, row) -> onTapCell(col, row) }
                    onTapPrecise?.let { cb ->
                        transform.fractionalCellAt(off.x, off.y)?.let { (col, row) -> cb(col, row) }
                    }
                },
                    onDragStart = { off -> onDrawStart?.invoke(transform.cellAt(off.x, off.y)) },
                    onDrag = { off -> onDrawTo?.invoke(transform.cellAt(off.x, off.y)) },
                    onDragEnd = { onDrawEnd?.invoke() },
                    onTransform = { centroid, pan, zoom ->
                        transform.transform(centroid.x, centroid.y, pan.x, pan.y, zoom)
                        version++
                    },
                )
            }

        Canvas(canvasMod) {
            version // read so the draw re-runs after a gesture
            clipRect {
                translate(transform.panX, transform.panY) {
                    draw(transform.cellPx)
                }
            }
        }
    }
}
