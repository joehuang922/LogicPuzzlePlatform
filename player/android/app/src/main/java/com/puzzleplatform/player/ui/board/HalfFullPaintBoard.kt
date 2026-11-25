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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HalfFullPaintEngine

private val LINE_THIN = Color(0xFF555555)
private val LINE_THICK = Color.Black
private val DOT_COLOR = Color(0xFF777777)
private val ERROR = Color(0xFFD32F2F)
private val BAD_ROOM = Color(0xFFFDE0E0)

/**
 * Compose Canvas renderer for Half-Full Paint (puzzle type 48), the analog of
 * frontend/src/components/HalfFullPaintBoard.tsx.
 *
 * Input is the shared shade/mark tap cycle ([onTapCell] -> PlayViewModel.tapShadeCell):
 * unset -> shaded -> dot. Shaded cells use [BoardColors.ROOM_SHADE] so walls read through;
 * circles are drawn on top (Kuralin's). With [liveValidate] on, a circle its cells already
 * break is outlined red and a room that can't come out is tinted. Above the board sits the
 * picture preview, the same picture the solved thumbnail shows.
 *
 * The Admin review editor passes [onEditTap] (fractional cell coordinates): taps go there,
 * the preview is left out, and [problemCells] are drawn.
 */
@Composable
fun HalfFullPaintBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((x: Float, y: Float) -> Unit)? = null,
    problemCells: Set<Pair<Int, Int>> = emptySet(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { HalfFullPaintEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onEdit = rememberUpdatedState(onEditTap)
    val editing = onEditTap != null
    val roomIds = remember(board) { HalfFullPaintEngine.rooms(board).first }
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) HalfFullPaintEngine.brokenClues(board, userValues) else null
    }
    val picture = remember(board, userValues) { HalfFullPaintEngine.pictureCells(board, userValues) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!editing) PicturePreview(picture, rows, cols, HalfFullPaintEngine.GROUND_ARGB)

        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            onTapCell = { col, row -> if (onEdit.value == null) onTap.value(col, row) },
            onTapPrecise = if (editing) { x, y -> onEdit.value?.invoke(x, y) } else null,
        ) { cell ->
            val values = valuesState.value
            drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))
            for (r in 0 until rows) for (c in 0 until cols) {
                val at = Offset(c * cell, r * cell)
                val badRoom = broken?.rooms?.contains(roomIds[r][c]) == true
                when (values[HalfFullPaintEngine.cellKey(c, r)]) {
                    HalfFullPaintEngine.SHADED -> {
                        drawRect(BoardColors.ROOM_SHADE, at, Size(cell, cell))
                        if (badRoom) {
                            drawRect(ERROR, at + Offset(cell * 0.06f, cell * 0.06f), Size(cell * 0.88f, cell * 0.88f),
                                style = Stroke(2.dp.toPx()))
                        }
                    }
                    HalfFullPaintEngine.DOT -> {
                        if (badRoom) drawRect(BAD_ROOM, at, Size(cell, cell))
                        drawCircle(DOT_COLOR, cell * 0.08f, Offset((c + 0.5f) * cell, (r + 0.5f) * cell))
                    }
                    else -> if (badRoom) drawRect(BAD_ROOM, at, Size(cell, cell))
                }
            }

            val thin = 1.dp.toPx()
            val thick = 3.dp.toPx()
            for (r in 0..rows) for (c in 0 until cols) {
                val wall = r == 0 || r == rows || board.wallBelow(r - 1, c)
                drawLine(if (wall) LINE_THICK else LINE_THIN, Offset(c * cell, r * cell), Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (wall) thick else thin, cap = StrokeCap.Square)
            }
            for (r in 0 until rows) for (c in 0..cols) {
                val wall = c == 0 || c == cols || board.wallRight(r, c - 1)
                drawLine(if (wall) LINE_THICK else LINE_THIN, Offset(c * cell, r * cell), Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (wall) thick else thin, cap = StrokeCap.Square)
            }

            for ((r, c) in problemCells) {
                val inset = cell * 0.1f
                drawRect(ERROR, Offset(c * cell + inset, r * cell + inset), Size(cell - 2 * inset, cell - 2 * inset),
                    style = Stroke(width = 2.dp.toPx()))
            }

            board.circles.forEachIndexed { i, circle ->
                drawKuralinCircle(circle, cell, broken?.circles?.contains(i) == true)
            }
        }
    }
}
