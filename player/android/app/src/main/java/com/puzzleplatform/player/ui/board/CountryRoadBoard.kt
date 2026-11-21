package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.CountryRoadEngine

private val LINE_THIN = Color(0xFF555555)
private val LINE_THICK = Color.Black
private val MARK = Color(0xFF888888)
private val LOOP = Color(0xFF333333)
private val ERROR = Color(0xFFD32F2F)
private val BAD_ROOM = Color(0xFFFDE0E0)
private val SELECT_FILL = Color(0xFFFFF3C4)

/**
 * Compose Canvas renderer for Country Road (puzzle type 41), the analog of
 * frontend/src/components/CountryRoadBoard.tsx.
 *
 * A drag draws the loop between cell centres ([LoopStroke]: the first segment crossed
 * fixes draw or erase; changes go to [onApplyChanges]). A tap cycles the cell's mark
 * none -> × -> • through the shared shade/mark cycle ([onTapCell] ->
 * PlayViewModel.tapShadeCell). With [liveValidate] on, a room number the loop already
 * breaks is red, a room crossed more than twice is tinted, and × cells touching across a
 * wall are red.
 *
 * The Admin review editor passes [onEditTap] (fractional cell coordinates): taps go there
 * and the drag is off; [selectedCell] / [problemCells] are drawn.
 */
@Composable
fun CountryRoadBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((x: Float, y: Float) -> Unit)? = null,
    selectedCell: Pair<Int, Int>? = null,
    problemCells: Set<Pair<Int, Int>> = emptySet(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { CountryRoadEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onEdit = rememberUpdatedState(onEditTap)
    val editing = onEditTap != null
    val drag = remember(puzzle.id) { LoopStroke() }
    val roomIds = remember(board) { CountryRoadEngine.rooms(board).first }
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) CountryRoadEngine.brokenClues(board, userValues) else null
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> if (onEdit.value == null) onTap.value(col, row) },
        onTapPrecise = if (editing) { x, y -> onEdit.value?.invoke(x, y) } else null,
        // ZoomableBoard reports (col, row); the stroke works in (row, col), like the keys.
        onDrawStart = if (editing) null else { cell -> drag.start(cell?.let { (c, r) -> r to c }) },
        onDrawTo = if (editing) null else { cell ->
            drag.moveTo(cell?.let { (c, r) -> r to c }, valuesState.value) { onApply.value(it) }
        },
        onDrawEnd = if (editing) null else { { drag.end() } },
    ) { cell ->
        val values = valuesState.value
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))
        if (broken != null && broken.rooms.isNotEmpty()) {
            for (r in 0 until rows) for (c in 0 until cols) {
                if (roomIds[r][c] in broken.rooms) drawRect(BAD_ROOM, Offset(c * cell, r * cell), Size(cell, cell))
            }
        }
        selectedCell?.let { (r, c) -> drawRect(SELECT_FILL, Offset(c * cell, r * cell), Size(cell, cell)) }

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

        // Room numbers, top-left as printed.
        for (r in 0 until rows) for (c in 0 until cols) {
            val n = board.number(r, c)
            if (n <= 0) continue
            val bad = broken?.numbers?.contains(r to c) == true
            val paint = android.graphics.Paint().apply {
                color = (if (bad) ERROR else Color.Black).toArgb()
                textSize = cell * 0.42f
                isAntiAlias = true
                isFakeBoldText = bad
            }
            drawContext.canvas.nativeCanvas.drawText(n.toString(), c * cell + cell * 0.1f, r * cell - paint.fontMetrics.ascent + cell * 0.04f, paint)
        }

        // Marks under the loop.
        for (r in 0 until rows) for (c in 0 until cols) {
            val center = Offset((c + 0.5f) * cell, (r + 0.5f) * cell)
            when (values[CountryRoadEngine.cellKey(c, r)]) {
                CountryRoadEngine.CROSS -> {
                    val d = cell * 0.16f
                    val color = if (broken?.crosses?.contains(r to c) == true) ERROR else MARK
                    drawLine(color, center + Offset(-d, -d), center + Offset(d, d), strokeWidth = 2.dp.toPx())
                    drawLine(color, center + Offset(-d, d), center + Offset(d, -d), strokeWidth = 2.dp.toPx())
                }
                CountryRoadEngine.DOT -> drawCircle(MARK, cell * 0.09f, center)
            }
        }

        val loopW = cell * 0.12f
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            if (values[CountryRoadEngine.hKey(r, c)] == 1) {
                drawLine(LOOP, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), Offset((c + 1.5f) * cell, (r + 0.5f) * cell),
                    strokeWidth = loopW, cap = StrokeCap.Round)
            }
        }
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            if (values[CountryRoadEngine.vKey(r, c)] == 1) {
                drawLine(LOOP, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), Offset((c + 0.5f) * cell, (r + 1.5f) * cell),
                    strokeWidth = loopW, cap = StrokeCap.Round)
            }
        }

        for ((r, c) in problemCells) {
            val inset = cell * 0.1f
            drawRect(ERROR, Offset(c * cell + inset, r * cell + inset), Size(cell - 2 * inset, cell - 2 * inset),
                style = Stroke(width = 2.dp.toPx()))
        }
    }
}
