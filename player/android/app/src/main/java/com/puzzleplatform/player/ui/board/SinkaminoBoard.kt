package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.SinkaminoEngine
import com.puzzleplatform.player.puzzle.SinkaminoRules

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFAAAAAA)
private val LINE_THICK = Color.Black
private val BLACK_FILL = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF888888)
// Given squares are drawn like the print; placed squares in blue, as on the web board.
private val GIVEN_STROKE = Color(0xFF111111)
private val PLACED_STROKE = Color(0xFF1E5BB8)
private val PLACED_FILL = Color(0xFFDBE8FB)
private val ARROW_COLOR = Color(0xFF222222)
private val DRAFT_ARROW = Color(0xFF4A90D9)
private const val SQUARE_INSET = 0.22f

/**
 * Compose Canvas renderer for Sinkamino (puzzle type 31), the analog of
 * frontend/src/components/SinkaminoBoard.tsx.
 *
 * Input is the shared shade/mark tap cycle ([com.puzzleplatform.player.puzzle.ShadeCycle]):
 * a tap on a white cell goes empty -> square -> marked -> empty via [onTapCell]; black
 * cells and given squares ignore taps (the engine returns no group for them). Arrow
 * trails are drawn on top through cell centres with a triangular head.
 *
 * The Admin editor reuses it: in arrow mode it passes [onDrawStart]/[onDrawTo]/[onDrawEnd]
 * to draw a trail with one finger, and [draftTrail] to show the trail being drawn.
 */
@Composable
fun SinkaminoBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    draftTrail: List<Pair<Int, Int>> = emptyList(),
    onDrawStart: ((cell: Pair<Int, Int>?) -> Unit)? = null,
    onDrawTo: ((cell: Pair<Int, Int>?) -> Unit)? = null,
    onDrawEnd: (() -> Unit)? = null,
) {
    // Keyed on the canon too: the Admin editor changes it under a stable id.
    val grid = remember(puzzle.id, puzzle.canonRepr) { SinkaminoEngine.parse(puzzle) }
    val rows = grid.rows
    val cols = grid.cols
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val draftState = rememberUpdatedState(draftTrail)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
        onDrawStart = onDrawStart,
        onDrawTo = onDrawTo,
        onDrawEnd = onDrawEnd,
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        val inset = cell * SQUARE_INSET
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val topLeft = Offset(c * cell, r * cell)
                when (grid.cellAt(r, c)) {
                    SinkaminoRules.BLACK -> drawRect(BLACK_FILL, topLeft = topLeft, size = Size(cell, cell))
                    SinkaminoRules.GIVEN -> drawInsetSquare(topLeft, cell, inset, Color.White, GIVEN_STROKE, 1.5f)
                    else -> when (valuesState.value[SinkaminoEngine.cellKey(c, r)] ?: SinkaminoEngine.UNSET) {
                        SinkaminoEngine.SQUARE -> drawInsetSquare(topLeft, cell, inset, PLACED_FILL, PLACED_STROKE, 2f)
                        SinkaminoEngine.MARKED -> drawCircle(
                            MARK_COLOR,
                            radius = cell * 0.1f,
                            center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                        )
                    }
                }
            }
        }

        // Gridlines: thin interior dividers, thick outer border.
        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        for (r in 0..rows) {
            val border = r == 0 || r == rows
            drawLine(
                if (border) LINE_THICK else LINE_THIN, Offset(0f, r * cell), Offset(boardW, r * cell),
                strokeWidth = if (border) thick else thin, cap = StrokeCap.Square,
            )
        }
        for (c in 0..cols) {
            val border = c == 0 || c == cols
            drawLine(
                if (border) LINE_THICK else LINE_THIN, Offset(c * cell, 0f), Offset(c * cell, boardH),
                strokeWidth = if (border) thick else thin, cap = StrokeCap.Square,
            )
        }

        for (trail in grid.arrows) drawArrow(trail, cell, ARROW_COLOR)
        val draft = draftState.value
        if (draft.size >= 2) {
            drawArrow(draft, cell, DRAFT_ARROW)
        } else if (draft.size == 1) {
            val (r, c) = draft[0]
            drawCircle(DRAFT_ARROW, radius = cell * 0.1f, center = Offset(c * cell + cell / 2, r * cell + cell / 2))
        }
    }
}

private fun DrawScope.drawInsetSquare(
    topLeft: Offset,
    cell: Float,
    inset: Float,
    fill: Color,
    stroke: Color,
    strokeDp: Float,
) {
    val origin = Offset(topLeft.x + inset, topLeft.y + inset)
    val size = Size(cell - 2 * inset, cell - 2 * inset)
    drawRect(fill, topLeft = origin, size = size)
    drawRect(stroke, topLeft = origin, size = size, style = Stroke(strokeDp.dp.toPx()))
}

/** A trail (row, col) through cell centres, ending in a filled triangle on its last cell. */
private fun DrawScope.drawArrow(trail: List<Pair<Int, Int>>, cell: Float, color: Color) {
    if (trail.size < 2) return
    val pts = trail.map { (r, c) -> Offset(c * cell + cell / 2, r * cell + cell / 2) }
    val head = pts.last()
    val prev = pts[pts.size - 2]
    val d = head - prev
    val len = d.getDistance().takeIf { it > 0f } ?: 1f
    val u = Offset(d.x / len, d.y / len)
    val tip = head + u * (cell * 0.2f)
    val base = tip - u * (cell * 0.4f)
    val w = cell * 0.17f
    val n = Offset(-u.y, u.x)

    val line = Path().apply {
        moveTo(pts[0].x, pts[0].y)
        for (p in pts.subList(1, pts.size - 1)) lineTo(p.x, p.y)
        lineTo(base.x, base.y)
    }
    drawPath(line, color, style = Stroke(width = 2.dp.toPx(), join = StrokeJoin.Miter))
    val headPath = Path().apply {
        moveTo(tip.x, tip.y)
        lineTo(base.x + n.x * w, base.y + n.y * w)
        lineTo(base.x - n.x * w, base.y - n.y * w)
        close()
    }
    drawPath(headPath, color)
}
