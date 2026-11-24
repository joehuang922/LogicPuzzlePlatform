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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.IrregularNonogramEngine

private val PAPER = Color.White
private val CLUE_BG = Color(0xFFF1F1F1)
private val CLUE_LINE = Color(0xFFCCCCCC)
private val THIN = Color(0xFFBBBBBB)
private val THICK = Color(0xFF222222)
private val CLUE_TEXT = Color(0xFF222222)
private val CLUE_DONE = Color(0xFFAAAAAA)
private val ERROR = Color(0xFFDD3333)
private val FILL = Color(0xFF111111)
private val CROSS = Color(0xFF999999)
private val SELECT = Color(0xFFDBE8FF)

/**
 * Compose Canvas renderer for Irregular Nonogram (puzzle type 45), the analog of
 * frontend/src/components/IrregularNonogramBoard.tsx: the board's cells and each clue
 * block where the canon puts it, on one lattice ([IrregularNonogramEngine.layoutBounds]).
 *
 * Input is Nonogram's: [mode] picks fill or cross; a tap toggles one cell, a one-finger
 * drag paints the origin's new state over cells still in the origin's old state. Only
 * board cells take input; values are "col,row" -> 1 / 2 through [onSetCell]. A clue
 * greys out once its piece matches, and with [liveValidate] turns red when its marks can
 * no longer fit. The filled picture is previewed above.
 *
 * The Admin review editor passes [onEditTap] (lattice row, col, which may lie outside the
 * board): taps edit instead of play, drags do nothing, the preview is left out, and
 * [selected] / [marks] highlight cells.
 */
@Composable
fun IrregularNonogramBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    mode: NonogramMode,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((row: Int, col: Int) -> Unit)? = null,
    selected: Set<Pair<Int, Int>> = emptySet(),
    marks: Map<Pair<Int, Int>, Color> = emptyMap(),
    showLattice: Boolean = false,
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { IrregularNonogramEngine.parseBoard(puzzle) }
    if (board.rows == 0 || board.cols == 0) return
    val base = remember(board) { IrregularNonogramEngine.layoutBounds(board) }
    // The editor's shape mode leaves a ring of lattice cells to grow the board into.
    val bounds = if (showLattice) intArrayOf(base[0] - 1, base[1] - 1, base[2] + 1, base[3] + 1) else base
    val minR = bounds[0]
    val minC = bounds[1]
    val latRows = bounds[2] - minR + 1
    val latCols = bounds[3] - minC + 1

    val valuesState = rememberUpdatedState(userValues)
    val modeState = rememberUpdatedState(mode)
    val onSet = rememberUpdatedState(onSetCell)
    val onEdit = rememberUpdatedState(onEditTap)
    val boardState = rememberUpdatedState(board)
    val drag = remember(puzzle.id) { PaintDrag() }
    val playing = onEditTap == null

    val status = remember(board, userValues) { IrregularNonogramEngine.clueStatus(board, userValues) }
    val numbers = remember(board, userValues) { IrregularNonogramEngine.numberStatus(board, userValues) }
    val segments = remember(board) { IrregularNonogramEngine.segments(board) }
    val clued = remember(board) { IrregularNonogramEngine.cluesBySegment(board) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (playing) {
            val picture = remember(board, userValues) {
                IrregularNonogramEngine.pictureCells(board, userValues, IrregularNonogramEngine.GROUND_ARGB)
            }
            PicturePreview(picture, board.rows, board.cols, IrregularNonogramEngine.GROUND_ARGB)
        }
        ZoomableBoard(
            cols = latCols,
            rows = latRows,
            resetKey = puzzle.id,
            onTapCell = { col, row ->
                val r = row + minR
                val c = col + minC
                val edit = onEdit.value
                if (edit != null) {
                    edit(r, c)
                } else if (boardState.value.isBoard(r, c)) {
                    drag.tap(r, c, modeState.value, valuesState.value, onSet.value)
                }
            },
            onDrawStart = if (playing) {
                { cell ->
                    val rc = cell?.let { (c, r) -> (r + minR) to (c + minC) }?.takeIf { boardState.value.isBoard(it.first, it.second) }
                    drag.start(rc, modeState.value, valuesState.value, onSet.value)
                }
            } else {
                null
            },
            onDrawTo = if (playing) {
                { cell ->
                    val rc = cell?.let { (c, r) -> (r + minR) to (c + minC) }?.takeIf { boardState.value.isBoard(it.first, it.second) }
                    drag.moveTo(rc, valuesState.value, onSet.value)
                }
            } else {
                null
            },
            onDrawEnd = if (playing) {
                { drag.end() }
            } else {
                null
            },
        ) { cell ->
            fun x(c: Int) = (c - minC) * cell
            fun y(r: Int) = (r - minR) * cell
            if (showLattice) {
                for (r in 0 until latRows) for (c in 0 until latCols) {
                    drawRect(Color(0xFFEEEEEE), Offset(c * cell, r * cell), Size(cell, cell), style = Stroke(1f))
                }
            }
            // Clue blocks.
            for (s in segments) {
                val clue = clued[s.key] ?: continue
                val done = s.key in status.first
                val bad = liveValidate && s.key in status.second
                val perNumber = numbers[s.key]
                IrregularNonogramEngine.clueLayout(clue, s.length).forEachIndexed { i, (r, c, v) ->
                    drawRect(CLUE_BG, Offset(x(c), y(r)), Size(cell, cell))
                    drawRect(if (bad) ERROR else CLUE_LINE, Offset(x(c), y(r)), Size(cell, cell), style = Stroke(if (bad) cell * 0.08f else 1f))
                    // Nonogram's colours: a settled number grey (always), a contradicted
                    // one red (errors on only).
                    val st = if (done) IrregularNonogramEngine.SATISFIED_NUMBER else perNumber?.getOrNull(i)
                    val colour = when {
                        st == com.puzzleplatform.player.puzzle.NonogramEngine.ClueStatus.SATISFIED -> CLUE_DONE
                        st == com.puzzleplatform.player.puzzle.NonogramEngine.ClueStatus.ERROR && liveValidate -> ERROR
                        else -> CLUE_TEXT
                    }
                    drawNumber(v, x(c) + cell / 2, y(r) + cell / 2, cell, colour)
                }
            }
            // Board cells, fills and crosses.
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                if (!board.cells[r][c]) continue
                val st = IrregularNonogramEngine.state(userValues, r, c)
                val bg = when {
                    st == IrregularNonogramEngine.FILLED -> FILL
                    (r to c) in selected -> SELECT
                    else -> PAPER
                }
                drawRect(bg, Offset(x(c), y(r)), Size(cell, cell))
                if (st == IrregularNonogramEngine.CROSSED) {
                    val m = cell * 0.28f
                    drawLine(CROSS, Offset(x(c) + m, y(r) + m), Offset(x(c) + cell - m, y(r) + cell - m), cell * 0.06f)
                    drawLine(CROSS, Offset(x(c) + cell - m, y(r) + m), Offset(x(c) + m, y(r) + cell - m), cell * 0.06f)
                }
            }
            // Lines: thin inside the board, thick every 5 lattice cells and around it.
            val thin = maxOf(1f, cell * 0.03f)
            val thick = maxOf(2f, cell * 0.08f)
            fun heavy(i: Int) = Math.floorMod(i, 5) == 0
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                if (!board.cells[r][c]) continue
                val top = !board.isBoard(r - 1, c) || heavy(r)
                val left = !board.isBoard(r, c - 1) || heavy(c)
                drawLine(if (top) THICK else THIN, Offset(x(c), y(r)), Offset(x(c + 1), y(r)), if (top) thick else thin)
                drawLine(if (left) THICK else THIN, Offset(x(c), y(r)), Offset(x(c), y(r + 1)), if (left) thick else thin)
                if (!board.isBoard(r + 1, c)) drawLine(THICK, Offset(x(c), y(r + 1)), Offset(x(c + 1), y(r + 1)), thick)
                if (!board.isBoard(r, c + 1)) drawLine(THICK, Offset(x(c + 1), y(r)), Offset(x(c + 1), y(r + 1)), thick)
            }
            for ((rc, color) in marks) {
                val (r, c) = rc
                val inset = cell * 0.12f
                drawRect(color, Offset(x(c) + inset, y(r) + inset), Size(cell - 2 * inset, cell - 2 * inset), style = Stroke(maxOf(1f, cell * 0.08f)))
            }
        }
    }
}

private fun DrawScope.drawNumber(v: Int, cx: Float, cy: Float, cell: Float, color: Color) {
    val paint = android.graphics.Paint().apply {
        isAntiAlias = true
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = cell * (if (v >= 10) 0.48f else 0.62f)
        isFakeBoldText = true
        this.color = color.toArgb()
    }
    val baseline = cy - (paint.descent() + paint.ascent()) / 2
    drawContext.canvas.nativeCanvas.drawText(v.toString(), cx, baseline, paint)
}

/**
 * Nonogram's drag: the origin cell toggles to the mode's mark (or clears when it already
 * holds it), and the drag paints that over cells still in the origin's old state, so a
 * sweep never overwrites other marks. Cells are (row, col).
 */
private class PaintDrag {
    private var last: Pair<Int, Int>? = null
    private var target = IrregularNonogramEngine.UNSET
    private var paintOver = IrregularNonogramEngine.UNSET

    private fun mark(mode: NonogramMode) =
        if (mode == NonogramMode.CROSS) IrregularNonogramEngine.CROSSED else IrregularNonogramEngine.FILLED

    fun start(cell: Pair<Int, Int>?, mode: NonogramMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null) { last = null; return }
        val (r, c) = cell
        val current = IrregularNonogramEngine.state(values, r, c)
        paintOver = current
        target = if (current == mark(mode)) IrregularNonogramEngine.UNSET else mark(mode)
        set(c, r, target)
        last = cell
    }

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val prev = last ?: return
        if (cell == null || cell == prev) return
        val (r, c) = cell
        if (IrregularNonogramEngine.state(values, r, c) == paintOver) set(c, r, target)
        last = cell
    }

    fun end() { last = null }

    fun tap(r: Int, c: Int, mode: NonogramMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val current = IrregularNonogramEngine.state(values, r, c)
        set(c, r, if (current == mark(mode)) IrregularNonogramEngine.UNSET else mark(mode))
    }
}
