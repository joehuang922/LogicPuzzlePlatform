package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
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
import com.puzzleplatform.player.puzzle.ZebraRopeEngine

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFF555555)
private val LINE_THICK = Color.Black
// Zebra Rope has no rooms, so the near-black fill hides no borders (as on the web board).
private val SHADE_FILL = Color(0xFF333333)
// Marked unshaded cells are light yellow rather than a dot, which ropes and circles hide.
private val MARK_FILL = Color(0xFFFFF3B0)
// Ropes as printed: a gray band with a thin dark outline.
private val ROPE_OUTLINE = Color(0xFF444444)
private val ROPE_BAND = Color(0xFFA8A8A8)
private val ERROR = Color(0xFFD32F2F)
private val CIRCLE_OUTLINE = Color(0xFF222222)
private val CIRCLE_FILL = listOf(Color.White, Color(0xFF111111), Color(0xFFAAAAAA))

/**
 * Compose Canvas renderer for Zebra Rope (puzzle type 36), the analog of
 * frontend/src/components/ZebraRopeBoard.tsx.
 *
 * Input is the shared shade/mark tap cycle on every cell ([onTapCell] goes to
 * PlayViewModel.tapShadeCell). Ropes and circles are drawn over the cell fills; with
 * [liveValidate] on, a rope or circle the decided cells already break is outlined red.
 * Above the board sits a small preview of the shaded cells, the same picture the
 * collection thumbnail shows once solved. Two fingers pan/zoom via [ZoomableBoard].
 *
 * The Admin review editor passes [onTapPoint] (a tap at fractional cell coordinates, for
 * cycling a circle) and the precise drag callbacks (for drawing a rope, shown as
 * [draftRope]); taps then don't shade cells, and the preview is left out.
 */
@Composable
fun ZebraRopeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onTapPoint: ((col: Float, row: Float) -> Unit)? = null,
    onDrawStartPrecise: ((col: Float, row: Float) -> Unit)? = null,
    onDrawToPrecise: ((col: Float, row: Float) -> Unit)? = null,
    onDrawEnd: (() -> Unit)? = null,
    draftRope: List<Pair<Int, Int>> = emptyList(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { ZebraRopeEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onPoint = rememberUpdatedState(onTapPoint)
    val draftState = rememberUpdatedState(draftRope)
    val editing = onTapPoint != null
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) ZebraRopeEngine.brokenClues(board, userValues) else emptySet<Int>() to emptySet()
    }
    val picture = remember(board, userValues) { ZebraRopeEngine.pictureCells(board, userValues) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!editing) PicturePreview(picture, rows, cols, ZebraRopeEngine.GROUND_ARGB)

        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            onTapCell = { col, row -> if (onPoint.value == null) onTap.value(col, row) },
            onTapPrecise = if (editing) { col, row -> onPoint.value?.invoke(col, row) } else null,
            onDrawStartPrecise = onDrawStartPrecise,
            onDrawToPrecise = onDrawToPrecise,
            onDrawEnd = onDrawEnd,
        ) { cell ->
            val boardW = cols * cell
            val boardH = rows * cell
            drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

            for (r in 0 until rows) {
                for (c in 0 until cols) {
                    val fill = when (valuesState.value[ZebraRopeEngine.cellKey(c, r)]) {
                        ZebraRopeEngine.SHADED -> SHADE_FILL
                        ZebraRopeEngine.MARKED -> MARK_FILL
                        else -> continue
                    }
                    drawRect(fill, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
                }
            }

            val thin = 1.dp.toPx()
            val thick = 3.dp.toPx()
            for (r in 0..rows) {
                val isBorder = r == 0 || r == rows
                drawLine(
                    if (isBorder) LINE_THICK else LINE_THIN,
                    Offset(0f, r * cell),
                    Offset(boardW, r * cell),
                    strokeWidth = if (isBorder) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
            for (c in 0..cols) {
                val isBorder = c == 0 || c == cols
                drawLine(
                    if (isBorder) LINE_THICK else LINE_THIN,
                    Offset(c * cell, 0f),
                    Offset(c * cell, boardH),
                    strokeWidth = if (isBorder) thick else thin,
                    cap = StrokeCap.Square,
                )
            }

            board.ropes.forEachIndexed { i, rope -> drawRope(rope, cell, i in broken.second) }
            if (draftState.value.size >= 2) drawRope(draftState.value, cell, error = false, highlight = true)
            board.circles.forEachIndexed { i, circle -> drawZebraCircle(circle, cell, i in broken.first) }
        }
    }
}

private val DRAFT_ROPE = Color(0xFF1976D2)

private fun DrawScope.drawRope(rope: List<Pair<Int, Int>>, cell: Float, error: Boolean, highlight: Boolean = false) {
    val path = Path()
    rope.forEachIndexed { j, (r, c) ->
        val x = (c + 0.5f) * cell
        val y = (r + 0.5f) * cell
        if (j == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    if (highlight) {
        drawPath(path, DRAFT_ROPE.copy(alpha = 0.7f), style = Stroke(width = cell * 0.24f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        return
    }
    drawPath(
        path,
        if (error) ERROR else ROPE_OUTLINE,
        style = Stroke(width = cell * 0.24f, cap = StrokeCap.Round, join = StrokeJoin.Round),
    )
    drawPath(path, ROPE_BAND, style = Stroke(width = cell * 0.16f, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

private fun DrawScope.drawZebraCircle(circle: ZebraRopeEngine.Circle, cell: Float, error: Boolean) {
    val center = Offset(circle.dc * cell / 2, circle.dr * cell / 2)
    val radius = cell * 0.17f
    // White halo keeps a black circle visible on a shaded cell.
    drawCircle(Color.White, radius + 1.5.dp.toPx(), center)
    drawCircle(CIRCLE_FILL.getOrElse(circle.color) { Color.White }, radius, center)
    drawCircle(
        if (error) ERROR else CIRCLE_OUTLINE,
        radius,
        center,
        style = Stroke(width = if (error) 2.5.dp.toPx() else 1.5.dp.toPx()),
    )
}
