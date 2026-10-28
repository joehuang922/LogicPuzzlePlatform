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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.KuralinEngine
import com.puzzleplatform.player.puzzle.ShadeCycle

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFF999999)
// Kuralin has no rooms, so the near-black web fill doesn't hide any borders here.
private val BLACK_FILL = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF999999)
private val LOOP_COLOR = Color(0xFF555555)
private val CIRCLE_OUTLINE = Color(0xFF222222)
private val ERROR_OUTLINE = Color(0xFFD32F2F)

/** Circle fills by color, as on the web board: white, black, gray. */
internal val KURALIN_CIRCLE_FILL = listOf(Color.White, Color(0xFF111111), Color(0xFFAAAAAA))

/**
 * Compose Canvas renderer for Kuralin (puzzle type 28), the analog of
 * frontend/src/components/KuralinBoard.tsx. Input is Yajilin's:
 *  - a tap cycles the cell empty -> black -> marked -> empty, the shared shade/mark
 *    interaction ([onTapCell] -> PlayViewModel.tapShadeCell);
 *  - a drag draws the loop between cell centers. The first segment crossed fixes the
 *    stroke as draw or erase. Drawing onto a marked cell clears its mark (in the same batch
 *    as the segment), and a segment is refused when either end is blackened or already has
 *    two segments.
 * Two fingers pan/zoom via [ZoomableBoard].
 *
 * Rendering mirrors the web: dashed separators, a solid border, and the circles on top at
 * their doubled coordinates with a white halo so they read over black cells. With
 * [liveValidate], a circle whose touched cells are all decided and whose count fails is
 * outlined red.
 *
 * The Admin review editor passes [onTapPoint]: taps then snap to the nearest grid-line
 * point (doubled (dr, dc)) and go there instead, and the loop drag is off.
 */
@Composable
fun KuralinBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onTapPoint: ((dr: Int, dc: Int) -> Unit)? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val board = remember(puzzle.id, puzzle.canonRepr) { KuralinEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    // ZoomableBoard's gesture closures outlive recomposition, so read the freshest
    // values and callbacks through state.
    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onPoint = rememberUpdatedState(onTapPoint)
    val drag = remember(puzzle.id) {
        LoopStroke { from, to, key, current ->
            val g = KuralinEngine.grids(rows, cols, current)
            if (!KuralinEngine.canDrawEdge(g, from.first, from.second) ||
                !KuralinEngine.canDrawEdge(g, to.first, to.second)
            ) {
                return@LoopStroke null
            }
            // The loop passes through both cells, so neither can stay marked "not black".
            buildMap {
                put(key, 1)
                for ((r, c) in listOf(from, to)) {
                    val bKey = KuralinEngine.cellKey(c, r)
                    if (current[bKey] == ShadeCycle.MARKED) put(bKey, 0)
                }
            }
        }
    }
    val editing = onTapPoint != null

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> if (onPoint.value == null) onTap.value(col, row) },
        onTapPrecise = { fx, fy ->
            val cb = onPoint.value ?: return@ZoomableBoard
            KuralinEngine.nearestPoint(fx, fy, rows, cols)?.let { (dr, dc) -> cb(dr, dc) }
        },
        // ZoomableBoard reports (col, row); the stroke works in (row, col) to match the
        // row-first "h:r,c"/"v:r,c"/"b:r,c" keys, so swap at the boundary.
        onDrawStart = if (editing) null else { cell -> drag.start(cell?.let { (c, r) -> r to c }) },
        onDrawTo = if (editing) null else { cell ->
            drag.moveTo(cell?.let { (c, r) -> r to c }, valuesState.value) { onApply.value(it) }
        },
        onDrawEnd = if (editing) null else { { drag.end() } },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        val values = valuesState.value
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Cell states: black squares and mark dots.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (values[KuralinEngine.cellKey(c, r)]) {
                    ShadeCycle.SHADED -> drawRect(
                        BLACK_FILL,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    ShadeCycle.MARKED -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.09f,
                        center = Offset((c + 0.5f) * cell, (r + 0.5f) * cell),
                    )
                }
            }
        }

        val gridW = 1.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.075f, cell * 0.075f))
        for (r in 1 until rows) {
            drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), gridW, pathEffect = dash)
        }
        for (c in 1 until cols) {
            drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), gridW, pathEffect = dash)
        }
        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = 2.dp.toPx()))

        // Loop segments.
        val loopW = cell * 0.09f
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (values[KuralinEngine.hKey(r, c)] != 1) continue
                val y = (r + 0.5f) * cell
                drawLine(LOOP_COLOR, Offset((c + 0.5f) * cell, y), Offset((c + 1.5f) * cell, y), loopW, cap = StrokeCap.Round)
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (values[KuralinEngine.vKey(r, c)] != 1) continue
                val x = (c + 0.5f) * cell
                drawLine(LOOP_COLOR, Offset(x, (r + 0.5f) * cell), Offset(x, (r + 1.5f) * cell), loopW, cap = StrokeCap.Round)
            }
        }

        // Circles on top.
        val g = if (liveValidate) KuralinEngine.grids(rows, cols, values) else null
        for (circle in board.circles) {
            val error = g != null && KuralinEngine.circleInError(circle, g)
            drawKuralinCircle(circle, cell, error)
        }
    }
}

/** One circle at its doubled coordinates, with a white halo so it reads over black cells. */
private fun DrawScope.drawKuralinCircle(circle: KuralinEngine.Circle, cell: Float, error: Boolean) {
    val center = Offset(circle.dc / 2f * cell, circle.dr / 2f * cell)
    val radius = cell * 0.24f
    drawCircle(Color.White, radius + 1.5.dp.toPx(), center)
    drawCircle(KURALIN_CIRCLE_FILL.getOrElse(circle.color) { Color.White }, radius, center)
    drawCircle(
        if (error) ERROR_OUTLINE else CIRCLE_OUTLINE,
        radius,
        center,
        style = Stroke(if (error) 2.5.dp.toPx() else 1.5.dp.toPx()),
    )
}
