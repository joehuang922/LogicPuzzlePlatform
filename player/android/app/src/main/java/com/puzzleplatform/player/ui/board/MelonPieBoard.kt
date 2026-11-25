package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.MelonPieEngine
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

private val GRID = Color(0xFF888888)
private val LINE = Color(0xFF333333)
private val MARK = Color(0xFF888888)
private val ERROR = Color(0xFFD32F2F)
private val OUTLINE = Color(0xFF111111)
internal val MELON_CIRCLE_FILL = listOf(Color.White, Color(0xFF111111), Color(0xFF9A9A9A))

// A dragged finger joins a point within this fraction of the spacing.
private const val CAPTURE = 0.35f

/** Drag-to-draw state: the last point the finger joined and whether this stroke draws or erases. */
private class MelonDragState {
    var last: Pair<Int, Int>? = null
    var draw: Boolean? = null
}

/**
 * Compose Canvas renderer for Melon Pie (puzzle type 49), the analog of
 * frontend/src/components/MelonPieBoard.tsx.
 *
 * As Whimsical Knight's board, the lattice is drawn one point per [ZoomableBoard] cell, at
 * the cell's centre, so border points and their circles are reachable. A one-finger drag
 * from point to point toggles the segment between them (the stroke's first segment decides
 * draw vs erase); a tap toggles a × mark on the nearest segment (erasing a drawn one).
 * Changes go out through [onApplyChanges] (0 drops the key). With [liveValidate] on, a
 * circle with 2+ segments or joined to another colour is outlined red, and so is a plain
 * point with three segments.
 *
 * The Admin review editor passes [onEditTap]: a tap then reports the nearest point (r, c)
 * for cycling its circle, and dragging draws nothing.
 */
@Composable
fun MelonPieBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((r: Int, c: Int) -> Unit)? = null,
    problemPoints: Set<Pair<Int, Int>> = emptySet(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { MelonPieEngine.parseBoard(puzzle) }
    val rows = board.height + 1
    val cols = board.width + 1
    if (board.width < 1 || board.height < 1) return

    val valuesState = rememberUpdatedState(userValues)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onEdit = rememberUpdatedState(onEditTap)
    val editing = onEditTap != null
    val drag = remember(puzzle.id) { MelonDragState() }
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) MelonPieEngine.brokenClues(board, userValues) else null
    }

    // Fractional cell coordinates -> point coordinates: point (r, c) sits at cell centre (c + 0.5, r + 0.5).
    fun pointNear(col: Float, row: Float): Pair<Int, Int>? {
        val x = col - 0.5f
        val y = row - 0.5f
        val c = x.roundToInt()
        val r = y.roundToInt()
        if (r !in 0..board.height || c !in 0..board.width) return null
        return if (abs(x - c) <= CAPTURE && abs(y - r) <= CAPTURE) r to c else null
    }

    fun dragTo(col: Float, row: Float) {
        val p = pointNear(col, row) ?: return
        val last = drag.last
        if (last == p) return
        drag.last = p
        if (last == null || abs(p.first - last.first) + abs(p.second - last.second) != 1) return
        val key = if (p.first == last.first) {
            MelonPieEngine.hKey(p.first, minOf(p.second, last.second))
        } else {
            MelonPieEngine.vKey(minOf(p.first, last.first), p.second)
        }
        val on = valuesState.value[key] == MelonPieEngine.LINE
        val draw = drag.draw ?: (!on).also { drag.draw = it }
        if (on != draw) onApply.value(mapOf(key to if (draw) MelonPieEngine.LINE else 0))
    }

    // A tap toggles a × on the nearest segment; a drawn segment there is erased instead.
    fun tapAt(col: Float, row: Float) {
        val x = col - 0.5f
        val y = row - 0.5f
        val fx = x - floor(x)
        val fy = y - floor(y)
        val horizontal = minOf(fy, 1 - fy) <= minOf(fx, 1 - fx)
        val key = if (horizontal) {
            val r = y.roundToInt()
            val c = floor(x).toInt()
            if (r !in 0..board.height || c !in 0 until board.width) return
            MelonPieEngine.hKey(r, c)
        } else {
            val r = floor(y).toInt()
            val c = x.roundToInt()
            if (r !in 0 until board.height || c !in 0..board.width) return
            MelonPieEngine.vKey(r, c)
        }
        val next = if ((valuesState.value[key] ?: 0) == 0) MelonPieEngine.CROSS else 0
        onApply.value(mapOf(key to next))
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> },
        onTapPrecise = { col, row ->
            val edit = onEdit.value
            if (edit != null) {
                val r = (row - 0.5f).roundToInt().coerceIn(0, board.height)
                val c = (col - 0.5f).roundToInt().coerceIn(0, board.width)
                edit(r, c)
            } else {
                tapAt(col, row)
            }
        },
        onDrawStartPrecise = if (editing) null else { col, row ->
            drag.last = pointNear(col, row)
            drag.draw = null
        },
        onDrawToPrecise = if (editing) null else { col, row -> dragTo(col, row) },
        onDrawEnd = if (editing) null else {
            {
                drag.last = null
                drag.draw = null
            }
        },
    ) { cell ->
        fun at(r: Int, c: Int) = Offset((c + 0.5f) * cell, (r + 0.5f) * cell)
        val values = valuesState.value
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))

        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.1f, cell * 0.075f))
        for (r in 0..board.height) drawLine(GRID, at(r, 0), at(r, board.width), strokeWidth = 1.dp.toPx(), pathEffect = dash)
        for (c in 0..board.width) drawLine(GRID, at(0, c), at(board.height, c), strokeWidth = 1.dp.toPx(), pathEffect = dash)

        val lineW = cell * 0.1f
        val d = cell * 0.1f
        for (r in 0..board.height) for (c in 0 until board.width) {
            when (values[MelonPieEngine.hKey(r, c)]) {
                MelonPieEngine.LINE -> drawLine(LINE, at(r, c), at(r, c + 1), strokeWidth = lineW, cap = StrokeCap.Round)
                MelonPieEngine.CROSS -> {
                    val m = Offset((c + 1f) * cell, (r + 0.5f) * cell)
                    drawLine(MARK, m + Offset(-d, -d), m + Offset(d, d), strokeWidth = 2.dp.toPx())
                    drawLine(MARK, m + Offset(-d, d), m + Offset(d, -d), strokeWidth = 2.dp.toPx())
                }
            }
        }
        for (r in 0 until board.height) for (c in 0..board.width) {
            when (values[MelonPieEngine.vKey(r, c)]) {
                MelonPieEngine.LINE -> drawLine(LINE, at(r, c), at(r + 1, c), strokeWidth = lineW, cap = StrokeCap.Round)
                MelonPieEngine.CROSS -> {
                    val m = Offset((c + 0.5f) * cell, (r + 1f) * cell)
                    drawLine(MARK, m + Offset(-d, -d), m + Offset(d, d), strokeWidth = 2.dp.toPx())
                    drawLine(MARK, m + Offset(-d, d), m + Offset(d, -d), strokeWidth = 2.dp.toPx())
                }
            }
        }

        broken?.points?.forEach { (r, c) ->
            drawCircle(ERROR, cell * 0.16f, at(r, c), style = Stroke(2.5.dp.toPx()))
        }
        val radius = cell * 0.2f
        board.circles.forEachIndexed { i, k ->
            val bad = broken?.circles?.contains(i) == true
            drawCircle(MELON_CIRCLE_FILL.getOrElse(k.color) { Color.White }, radius, at(k.r, k.c))
            drawCircle(if (bad) ERROR else OUTLINE, radius, at(k.r, k.c), style = Stroke(if (bad) 2.5.dp.toPx() else 1.5.dp.toPx()))
        }
        for ((r, c) in problemPoints) {
            drawCircle(ERROR, cell * 0.32f, at(r, c), style = Stroke(2.dp.toPx()))
        }
    }
}
