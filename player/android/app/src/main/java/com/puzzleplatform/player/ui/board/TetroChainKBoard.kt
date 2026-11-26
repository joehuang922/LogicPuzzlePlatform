package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.KuralinEngine
import com.puzzleplatform.player.puzzle.TetroChainKEngine

private val LINE_THIN = Color(0xFF444444)
private val BORDER = Color(0xFF111111)
// No rooms to keep visible, so a dark fill; Kuralin's circles carry a white halo.
private val SHADE = Color(0xFF555555)
private val DOT_COLOR = Color(0xFF777777)
private val ERROR = Color(0xFFD32F2F)

/**
 * Compose Canvas renderer for Tetro Chain K (puzzle type 50), the analog of
 * frontend/src/components/TetroChainKBoard.tsx.
 *
 * Input is the shared shade/mark tap cycle ([onTapCell] -> PlayViewModel.tapShadeCell):
 * unset -> shaded -> dot. Circles are drawn on top with Kuralin's [drawKuralinCircle].
 * With [liveValidate] on, a circle its cells already break is outlined red, and so are
 * the cells of a group over 4, one stuck under 4, or a same-shape pair touching.
 *
 * The Admin review editor passes [onTapPoint]: taps snap to the nearest grid-line point
 * (doubled (dr, dc)) and go there instead, and [problemCells] are drawn.
 */
@Composable
fun TetroChainKBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onTapPoint: ((dr: Int, dc: Int) -> Unit)? = null,
    problemCells: Set<Pair<Int, Int>> = emptySet(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { TetroChainKEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onPoint = rememberUpdatedState(onTapPoint)
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) TetroChainKEngine.brokenClues(board, userValues) else null
    }

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
    ) { cell ->
        val values = valuesState.value
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))
        for (r in 0 until rows) for (c in 0 until cols) {
            val at = Offset(c * cell, r * cell)
            when (values[TetroChainKEngine.cellKey(c, r)]) {
                TetroChainKEngine.SHADED -> drawRect(SHADE, at, Size(cell, cell))
                TetroChainKEngine.DOT -> drawCircle(DOT_COLOR, cell * 0.08f, Offset((c + 0.5f) * cell, (r + 0.5f) * cell))
            }
            if (broken?.cells?.contains(r to c) == true) {
                drawRect(ERROR, at + Offset(cell * 0.08f, cell * 0.08f), Size(cell * 0.84f, cell * 0.84f),
                    style = Stroke(2.dp.toPx()))
            }
        }
        val thin = 1.dp.toPx()
        for (i in 1 until rows) drawLine(LINE_THIN, Offset(0f, i * cell), Offset(cols * cell, i * cell), strokeWidth = thin)
        for (i in 1 until cols) drawLine(LINE_THIN, Offset(i * cell, 0f), Offset(i * cell, rows * cell), strokeWidth = thin)
        drawRect(BORDER, Offset.Zero, Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        for ((r, c) in problemCells) {
            val inset = cell * 0.1f
            drawRect(ERROR, Offset(c * cell + inset, r * cell + inset), Size(cell - 2 * inset, cell - 2 * inset),
                style = Stroke(2.dp.toPx()))
        }
        board.circles.forEachIndexed { i, k -> drawKuralinCircle(k, cell, broken?.circles?.contains(i) == true) }
    }
}
