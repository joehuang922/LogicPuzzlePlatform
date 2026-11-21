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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.TilePaintEngine

private val LINE_THIN = Color(0xFF555555)
private val LINE_THICK = Color.Black
private val CLUE_TEXT = Color.Black
private val ERROR = Color(0xFFD32F2F)
private val SELECT_FILL = Color(0xFFFFF3C4)

/**
 * Compose Canvas renderer for Tile Paint (puzzle type 40), the analog of
 * frontend/src/components/TilePaintBoard.tsx.
 *
 * Input is the shared shade/mark tap cycle ([onTapCell] goes to
 * PlayViewModel.tapShadeCell; the engine's shadeGroup makes it the whole tile, and clue
 * cells take none). Shaded cells use [BoardColors.ROOM_SHADE] so walls stay visible. With
 * [liveValidate] on, a clue number its run already breaks is red. Above the board sits
 * the picture preview, the same picture the solved thumbnail shows.
 *
 * The Admin review editor passes [onEditTap] (fractional cell coordinates); taps then
 * don't shade, the preview is left out, and [selectedCell] / [problemCells] are drawn.
 */
@Composable
fun TilePaintBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((x: Float, y: Float) -> Unit)? = null,
    selectedCell: Pair<Int, Int>? = null,
    problemCells: Set<Pair<Int, Int>> = emptySet(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { TilePaintEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onEdit = rememberUpdatedState(onEditTap)
    val editing = onEditTap != null
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) TilePaintEngine.brokenClues(board, userValues) else emptySet()
    }
    val picture = remember(board, userValues) { TilePaintEngine.pictureCells(board, userValues) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!editing) PicturePreview(picture.first, picture.second, picture.third, TilePaintEngine.GROUND_ARGB)

        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            onTapCell = { col, row -> if (onEdit.value == null) onTap.value(col, row) },
            onTapPrecise = if (editing) { x, y -> onEdit.value?.invoke(x, y) } else null,
        ) { cell ->
            drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))
            selectedCell?.let { (r, c) -> drawRect(SELECT_FILL, Offset(c * cell, r * cell), Size(cell, cell)) }
            for (r in 0 until rows) for (c in 0 until cols) {
                when (valuesState.value[TilePaintEngine.cellKey(c, r)]) {
                    TilePaintEngine.SHADED -> if (board.isTile(r, c)) {
                        drawRect(BoardColors.ROOM_SHADE, Offset(c * cell, r * cell), Size(cell, cell))
                    }
                    TilePaintEngine.MARKED -> if (board.isTile(r, c)) {
                        drawCircle(Color.Black, cell * 0.09f, Offset((c + 0.5f) * cell, (r + 0.5f) * cell))
                    }
                }
            }

            // Clue cells: the diagonal (none on a blank one) and their numbers.
            val thin = 1.dp.toPx()
            for (r in 0 until rows) for (c in 0 until cols) {
                val clue = board.cells[r][c] ?: continue
                val x = c * cell
                val y = r * cell
                if (clue.right != null || clue.down != null) {
                    drawLine(LINE_THIN, Offset(x, y), Offset(x + cell, y + cell), strokeWidth = thin)
                }
                clue.right?.let {
                    val bad = Triple(r, c, true) in broken
                    drawClueText(it.toString(), x + cell * 0.72f, y + cell * 0.3f, cell, bad)
                }
                clue.down?.let {
                    val bad = Triple(r, c, false) in broken
                    drawClueText(it.toString(), x + cell * 0.28f, y + cell * 0.72f, cell, bad)
                }
            }

            val thick = 3.dp.toPx()
            for (r in 0..rows) for (c in 0 until cols) {
                val wall = r == 0 || r == rows || board.wallBelow(r - 1, c)
                drawLine(
                    if (wall) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (wall) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
            for (r in 0 until rows) for (c in 0..cols) {
                val wall = c == 0 || c == cols || board.wallRight(r, c - 1)
                drawLine(
                    if (wall) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (wall) thick else thin,
                    cap = StrokeCap.Square,
                )
            }

            for ((r, c) in problemCells) {
                val inset = cell * 0.1f
                drawRect(
                    ERROR,
                    Offset(c * cell + inset, r * cell + inset),
                    Size(cell - 2 * inset, cell - 2 * inset),
                    style = Stroke(width = 2.dp.toPx()),
                )
            }
        }
    }
}

private fun DrawScope.drawClueText(text: String, cx: Float, cy: Float, cell: Float, bad: Boolean) {
    val paint = android.graphics.Paint().apply {
        color = (if (bad) ERROR else CLUE_TEXT).toArgb()
        textSize = cell * if (text.length > 1) 0.34f else 0.4f
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = if (bad) {
            android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        } else {
            android.graphics.Typeface.DEFAULT
        }
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
