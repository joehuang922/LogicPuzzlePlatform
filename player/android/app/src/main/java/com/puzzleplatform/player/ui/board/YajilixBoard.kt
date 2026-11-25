package com.puzzleplatform.player.ui.board

import android.graphics.Paint
import android.graphics.Typeface
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
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.YajilixEngine

private val GRID = Color(0xFF999999)
private val BORDER = Color(0xFF222222)
private val CLUE = Color(0xFF111111)
private val MARK = Color(0xFF888888)
private val LOOP = Color(0xFF333333)
private val ERROR = Color(0xFFD32F2F)
private val BAD_CELL = Color(0xFFFDE0E0)
private val SELECT_FILL = Color(0xFFFFF3C4)

/**
 * Compose Canvas renderer for Yajilix (puzzle type 46), the analog of
 * frontend/src/components/YajilixBoard.tsx: dashed grid, solid border, clues as printed
 * (letter + number, the arrow above for left/right and to the right for up/down).
 *
 * A drag draws the loop between cell centres ([LoopStroke]; never into a clue cell). A tap
 * cycles an empty cell's mark none -> × -> • through the shared shade/mark cycle
 * ([onTapCell] -> PlayViewModel.tapShadeCell). With [liveValidate] on, a clue the
 * committed cells already break is red, and a clue cell the loop enters or a branching
 * cell is tinted.
 *
 * The Admin review editor passes [onEditTap]: taps go there (as a cell) and the drag is
 * off; [selectedCell] / [problemCells] are drawn and empty cells show a faint dot.
 */
@Composable
fun YajilixBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((col: Int, row: Int) -> Unit)? = null,
    selectedCell: Pair<Int, Int>? = null,
    problemCells: Set<Pair<Int, Int>> = emptySet(),
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { YajilixEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val boardState = rememberUpdatedState(board)
    val onTap = rememberUpdatedState(onTapCell)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onEdit = rememberUpdatedState(onEditTap)
    val editing = onEditTap != null
    // (row, col) cells; a segment into or out of a clue cell is never drawn.
    val drag = remember(puzzle.id) {
        LoopStroke { from, to, key, _ ->
            val b = boardState.value
            if (b.isClue(from.first, from.second) || b.isClue(to.first, to.second)) null else mapOf(key to 1)
        }
    }
    val broken = remember(board, userValues, liveValidate) {
        if (liveValidate) YajilixEngine.brokenClues(board, userValues) else null
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            val edit = onEdit.value
            if (edit != null) edit(col, row) else onTap.value(col, row)
        },
        onDrawStart = if (editing) null else { cell -> drag.start(cell?.let { (c, r) -> r to c }) },
        onDrawTo = if (editing) null else { cell ->
            drag.moveTo(cell?.let { (c, r) -> r to c }, valuesState.value) { onApply.value(it) }
        },
        onDrawEnd = if (editing) null else { { drag.end() } },
    ) { cell ->
        val values = valuesState.value
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))
        broken?.cells?.forEach { (r, c) -> drawRect(BAD_CELL, Offset(c * cell, r * cell), Size(cell, cell)) }
        selectedCell?.let { (r, c) -> drawRect(SELECT_FILL, Offset(c * cell, r * cell), Size(cell, cell)) }

        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.1f, cell * 0.075f))
        for (i in 1 until rows) {
            drawLine(GRID, Offset(0f, i * cell), Offset(cols * cell, i * cell), strokeWidth = 1.dp.toPx(), pathEffect = dash)
        }
        for (i in 1 until cols) {
            drawLine(GRID, Offset(i * cell, 0f), Offset(i * cell, rows * cell), strokeWidth = 1.dp.toPx(), pathEffect = dash)
        }
        drawRect(BORDER, Offset.Zero, Size(cols * cell, rows * cell), style = Stroke(width = 2.5.dp.toPx()))

        for (r in 0 until rows) for (c in 0 until cols) {
            val clue = board.clue(r, c)
            if (clue != null) {
                drawClue(clue, r, c, cell, if (broken?.clues?.contains(r to c) == true) ERROR else CLUE)
                continue
            }
            val center = Offset((c + 0.5f) * cell, (r + 0.5f) * cell)
            if (editing) drawCircle(Color(0xFFCCCCCC), cell * 0.06f, center)
            when (values[YajilixEngine.cellKey(c, r)]) {
                YajilixEngine.CROSS -> {
                    val d = cell * 0.16f
                    drawLine(MARK, center + Offset(-d, -d), center + Offset(d, d), strokeWidth = 2.dp.toPx())
                    drawLine(MARK, center + Offset(-d, d), center + Offset(d, -d), strokeWidth = 2.dp.toPx())
                }
                YajilixEngine.DOT -> drawCircle(MARK, cell * 0.09f, center)
            }
        }

        val loopW = cell * 0.12f
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            if (values[YajilixEngine.hKey(r, c)] == 1) {
                drawLine(LOOP, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), Offset((c + 1.5f) * cell, (r + 0.5f) * cell),
                    strokeWidth = loopW, cap = StrokeCap.Round)
            }
        }
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            if (values[YajilixEngine.vKey(r, c)] == 1) {
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

/** A clue as printed: letter + number, the arrow above (left/right) or to the right (up/down). */
internal fun DrawScope.drawClue(clue: YajilixEngine.Clue, r: Int, c: Int, cell: Float, color: Color) {
    val size = cell * 0.38f
    val bold = Paint().apply {
        this.color = color.toArgb()
        textSize = size
        isAntiAlias = true
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }
    // A serif I so it can't be read as 1 or l.
    val letterPaint = Paint(bold).apply {
        if (clue.kind == 'I') typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
    }
    val arrowPaint = Paint(bold).apply { textSize = size * 1.15f }
    val canvas = drawContext.canvas.nativeCanvas
    val cx = (c + 0.5f) * cell
    val cy = (r + 0.5f) * cell
    val text = clue.num.toString()
    val letterW = letterPaint.measureText(clue.kind.toString())
    val numW = bold.measureText(text)
    val baseline = { centerY: Float -> centerY - (bold.ascent() + bold.descent()) / 2 }
    val horizontal = clue.dir == YajilixEngine.Dir.LEFT || clue.dir == YajilixEngine.Dir.RIGHT
    val textCx = if (horizontal) cx else cx - size * 0.35f
    val textCy = if (horizontal) cy + size * 0.5f else cy
    val left = textCx - (letterW + numW) / 2
    canvas.drawText(clue.kind.toString(), left + letterW / 2, baseline(textCy), letterPaint)
    canvas.drawText(text, left + letterW + numW / 2, baseline(textCy), bold)
    if (horizontal) {
        canvas.drawText(clue.dir.arrow, cx, baseline(cy - size * 0.5f), arrowPaint)
    } else {
        canvas.drawText(clue.dir.arrow, cx + size * 0.85f, baseline(cy), arrowPaint)
    }
}
