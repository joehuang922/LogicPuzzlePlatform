package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.ShikakuEngine
import kotlin.math.max
import kotlin.math.min

private val GRID_BG = Color.White
private val LINE = Color.Black
private val CLUE_BG = Color(0xFF1F2937)
private val CLUE_TEXT = Color.White
// Region tints, matching the web board: gray = no/indeterminate clue, green = correct
// (one clue, area matches), red = wrong (multiple clues, or area != clue).
private val GRAY = Color(0xFF9CA3AF)
private val GREEN = Color(0xFF22C55E)
private val RED = Color(0xFFEF4444)
private val PREVIEW_OK = Color(0xFF3B82F6)
private const val FILL_ALPHA = 0.28f

/**
 * Compose Canvas renderer for Shikaku (puzzle type 22), the analog of
 * frontend/src/components/ShikakuBoard.tsx.
 *
 * The player divides the grid into rectangles, one per clue, whose area equals the clue.
 * The web board hit-tests pixel-precise corner handles for resize; touch has no such
 * precision, so the gesture model is adapted to cell granularity (and the answer data stays
 * byte-identical):
 *  - tap an empty cell       -> drop a 1x1 rectangle there,
 *  - tap inside a rectangle  -> erase it,
 *  - drag from an empty cell -> draw a new rectangle spanning start..finger,
 *  - drag from inside a rect -> resize it (the finger grabs the near corner; the opposite
 *    corner stays pinned),
 *  - two fingers             -> pan/zoom via [ZoomableBoard].
 * A draw/resize previews live (blue, or red when it would overlap another rectangle) and
 * commits only on release when it doesn't collide — mirroring the web board's onPointerUp.
 *
 * Rectangles render as a translucent tinted fill with a matching border: gray until the
 * rectangle holds exactly one clue, then green when its area matches that clue or red when
 * it doesn't (or it swallowed more than one clue). Clue circles are drawn on top.
 */
@Composable
fun ShikakuBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { ShikakuEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // Gesture closures outlive recomposition (ZoomableBoard's pointerInput doesn't restart
    // when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val cellsState = rememberUpdatedState(cells)
    val onApply = rememberUpdatedState(onApplyChanges)

    // The in-progress draw/resize; drives the live preview and commits on release.
    var drag by remember(puzzle.id) { mutableStateOf<ShikakuDrag?>(null) }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            // Tap toggles: inside a rect erases it, an empty cell drops a 1x1 rect.
            val list = ShikakuEngine.rects(cellsState.value, valuesState.value)
            val hit = list.firstOrNull { row in it.r until it.r + it.h && col in it.c until it.c + it.w }
            if (hit != null) {
                onApply.value(mapOf(ShikakuEngine.rectKey(hit.r, hit.c) to 0))
            } else {
                onApply.value(mapOf(ShikakuEngine.rectKey(row, col) to ShikakuEngine.encodeWH(1, 1)))
            }
        },
        onDrawStart = { cell ->
            if (cell == null) { drag = null; return@ZoomableBoard }
            val (col, row) = cell
            val list = ShikakuEngine.rects(cellsState.value, valuesState.value)
            val hit = list.firstOrNull { row in it.r until it.r + it.h && col in it.c until it.c + it.w }
            drag = if (hit != null) {
                // Resize: pin the corner farthest from the grabbed cell, drag the near one.
                val anchorR = if (row - hit.r <= hit.r + hit.h - 1 - row) hit.r + hit.h - 1 else hit.r
                val anchorC = if (col - hit.c <= hit.c + hit.w - 1 - col) hit.c + hit.w - 1 else hit.c
                ShikakuDrag(ShikakuEngine.rectKey(hit.r, hit.c), anchorR, anchorC, row, col)
            } else {
                ShikakuDrag(null, row, col, row, col)
            }
        },
        onDrawTo = { cell ->
            if (cell == null) return@ZoomableBoard
            val (col, row) = cell
            drag = drag?.let { if (it.curR == row && it.curC == col) it else it.copy(curR = row, curC = col) }
        },
        onDrawEnd = {
            val d = drag
            drag = null
            if (d == null) return@ZoomableBoard
            val list = ShikakuEngine.rects(cellsState.value, valuesState.value)
            val cand = d.candidate()
            val collides = list.any {
                ShikakuEngine.rectKey(it.r, it.c) != d.resizeKey && overlaps(it, cand)
            }
            if (collides) return@ZoomableBoard
            // Resize may move the top-left (its key), so drop the old key then add the new;
            // a same-key resize collapses to a single overwrite.
            val changes = LinkedHashMap<String, Int>()
            d.resizeKey?.let { changes[it] = 0 }
            changes[ShikakuEngine.rectKey(cand.r, cand.c)] = ShikakuEngine.encodeWH(cand.w, cand.h)
            onApply.value(changes)
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        val values = valuesState.value
        val list = ShikakuEngine.rects(cells, values)

        // Committed rectangles: translucent fill here, matching border after the grid lines.
        for (rect in list) {
            drawRect(
                tintFor(rect, cells).copy(alpha = FILL_ALPHA),
                topLeft = Offset(rect.c * cell, rect.r * cell),
                size = Size(rect.w * cell, rect.h * cell),
            )
        }

        // Grid: dashed thin interior lines, solid thick border.
        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.1f, cell * 0.1f), 0f)
        for (r in 1 until rows) {
            drawLine(LINE, Offset(0f, r * cell), Offset(boardW, r * cell), thin, pathEffect = dash)
        }
        for (c in 1 until cols) {
            drawLine(LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), thin, pathEffect = dash)
        }
        drawLine(LINE, Offset(0f, 0f), Offset(boardW, 0f), thick)
        drawLine(LINE, Offset(0f, boardH), Offset(boardW, boardH), thick)
        drawLine(LINE, Offset(0f, 0f), Offset(0f, boardH), thick)
        drawLine(LINE, Offset(boardW, 0f), Offset(boardW, boardH), thick)

        // Rectangle borders on top of the grid so the dashed lines don't break them up.
        // Inset by half the stroke so each border sits wholly inside its own rectangle:
        // neighbours show two distinct bands instead of one overpainting the other.
        val borderW = 4.dp.toPx()
        val inset = borderW / 2
        for (rect in list) {
            drawRect(
                tintFor(rect, cells),
                topLeft = Offset(rect.c * cell + inset, rect.r * cell + inset),
                size = Size(rect.w * cell - borderW, rect.h * cell - borderW),
                style = Stroke(borderW),
            )
        }

        // Live draw/resize preview, red when it would overlap another rectangle.
        drag?.let { d ->
            val cand = d.candidate()
            val collides = list.any {
                ShikakuEngine.rectKey(it.r, it.c) != d.resizeKey && overlaps(it, cand)
            }
            val color = if (collides) RED else PREVIEW_OK
            val x = cand.c * cell
            val y = cand.r * cell
            val w = cand.w * cell
            val h = cand.h * cell
            drawRect(color.copy(alpha = 0.2f), topLeft = Offset(x, y), size = Size(w, h))
            drawRect(
                color,
                topLeft = Offset(x, y),
                size = Size(w, h),
                style = Stroke(thick, pathEffect = PathEffect.dashPathEffect(floatArrayOf(cell * 0.15f, cell * 0.12f), 0f)),
            )
        }

        // Clue tokens on top: a dark circle with a white number.
        val tokenR = cell * 0.36f
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val v = cells[r][c]
                if (v <= 0) continue
                val cx = c * cell + cell / 2
                val cy = r * cell + cell / 2
                drawCircle(CLUE_BG, tokenR, Offset(cx, cy))
                drawClueText(v, cx, cy, cell)
            }
        }
    }
}

/** Which tint a committed rectangle gets, mirroring ShikakuBoard.tsx's fill logic. */
private fun tintFor(rect: ShikakuEngine.Rect, cells: List<List<Int>>): Color {
    var count = 0
    var value = 0
    for (r in rect.r until rect.r + rect.h) {
        for (c in rect.c until rect.c + rect.w) {
            val v = cells.getOrNull(r)?.getOrNull(c) ?: 0
            if (v > 0) { count++; value = v }
        }
    }
    return when {
        count == 1 && rect.w * rect.h == value -> GREEN
        count >= 2 || (count == 1 && rect.w * rect.h != value) -> RED
        else -> GRAY
    }
}

/** Do two rectangles share any cell? (web overlaps()) */
private fun overlaps(a: ShikakuEngine.Rect, b: ShikakuEngine.Rect): Boolean =
    a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h

/** Draw a (possibly multi-digit) clue number centered at (cx, cy). */
private fun DrawScope.drawClueText(value: Int, cx: Float, cy: Float, cell: Float) {
    val textSize = cell * (if (value >= 10) 0.3f else 0.38f)
    val paint = android.graphics.Paint().apply {
        color = CLUE_TEXT.toArgb()
        this.textSize = textSize
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy - (fm.ascent + fm.descent) / 2, paint)
}

/**
 * One in-progress draw or resize gesture. [anchorR]/[anchorC] is the fixed corner cell (the
 * drag's start for a fresh draw, or the pinned opposite corner for a resize); [curR]/[curC]
 * is the cell under the finger. [resizeKey] is the rect being resized, or null for a draw.
 */
private data class ShikakuDrag(
    val resizeKey: String?,
    val anchorR: Int,
    val anchorC: Int,
    val curR: Int,
    val curC: Int,
) {
    /** The rectangle spanning the anchor and current cells. */
    fun candidate(): ShikakuEngine.Rect {
        val r = min(anchorR, curR)
        val c = min(anchorC, curC)
        val h = max(anchorR, curR) - r + 1
        val w = max(anchorC, curC) - c + 1
        return ShikakuEngine.Rect(r, c, w, h)
    }
}
