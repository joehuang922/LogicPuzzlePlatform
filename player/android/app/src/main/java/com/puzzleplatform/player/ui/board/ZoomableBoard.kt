package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/** Largest cell the board is ever drawn at — zooming in stops here. */
private val MAX_CELL = 40.dp
/** Default target: auto-zoom so cells are at least this big when a board opens. */
private val AUTO_CELL = 28.dp
/** Below this, cells are too small to tap reliably, so entry (tap-to-select) is off. */
private val ENTRY_FLOOR = 24.dp

/**
 * A square, pinch-to-zoom + pan viewport for grid boards, shared by every puzzle
 * renderer. The child draws in board pixel coordinates via [draw], which receives
 * the current cell size in px; taps are translated back to (col, row) via
 * [onTapCell] with the pan/zoom inverted.
 *
 * The zoom/pan math lives in [BoardTransform] (unit-tested); this composable only
 * wires gestures and drawing to it. A board small enough to fit at the max cell
 * size (e.g. 9x9 Sudoku on a phone) has no zoom range and behaves exactly like a
 * plain fit-to-width board.
 *
 * [resetKey] recomputes the default zoom/pan when it changes (pass the puzzle id).
 */
@Composable
fun ZoomableBoard(
    cols: Int,
    rows: Int,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    resetKey: Any? = null,
    draw: DrawScope.(cellPx: Float) -> Unit,
) {
    if (cols <= 0 || rows <= 0) return
    val density = LocalDensity.current

    BoxWithConstraints(modifier.fillMaxWidth()) {
        val vpx = with(density) { maxWidth.toPx() } // viewport is square: vpx x vpx
        val maxCellPx = with(density) { MAX_CELL.toPx() }
        val autoCellPx = with(density) { AUTO_CELL.toPx() }
        val entryFloorPx = with(density) { ENTRY_FLOOR.toPx() }

        val transform = remember(cols, rows, resetKey, vpx) {
            BoardTransform(cols, rows, vpx, maxCellPx, autoCellPx, entryFloorPx)
        }
        // A version counter so gesture-driven mutations to `transform` recompose.
        var version by remember(transform) { mutableStateOf(0) }

        var canvasMod = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .pointerInput(transform) {
                detectTapGestures { off ->
                    transform.cellAt(off.x, off.y)?.let { (col, row) -> onTapCell(col, row) }
                }
            }
        if (transform.zoomable) {
            canvasMod = canvasMod.pointerInput(transform) {
                detectTransformGestures { centroid, panChange, zoomChange, _ ->
                    transform.transform(centroid.x, centroid.y, panChange.x, panChange.y, zoomChange)
                    version++
                }
            }
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
