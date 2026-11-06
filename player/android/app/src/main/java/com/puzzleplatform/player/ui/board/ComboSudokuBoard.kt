package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.ComboSudokuEngine

private val COMBO_BG = Color.White
private val COMBO_LINE = Color.Black
private val COMBO_GIVEN = Color.Black
private val COMBO_USER = Color(0xFF888888)
private val COMBO_NOTE = Color(0xFF999999)
private val COMBO_CONFLICT = Color(0xFFD32F2F)
private val COMBO_SELECT = Color(0x9963A4FF)
private val COMBO_PEER = Color(0x33BBDEFB)
private val COMBO_FOCUS_BOARD = Color(0xFFFFA000)
private val COMBO_HINT = Color(0xFFFFF59D) // the hinted next cell, amber like SudokuBoard
private val MINI_PROBLEM_TINT = Color(0x33D32F2F)

/**
 * Compose renderer for combo sudoku, the analog of
 * frontend/src/components/ComboSudokuBoard.tsx, drawn like [SudokuBoard]: thin cell
 * lines, medium room lines, a thick outline round the whole shape; givens in bold
 * black, entries in grey (red in conflict when [liveValidate]), pencil marks in a
 * 3x3 sub-layout. Selecting a cell highlights its peers in every board containing it.
 *
 * Cells no board covers are blank paper and take no input. The grid can be 48x30
 * cells (a 14-board spread), so it rides on [ZoomableBoard]'s pinch/pan.
 * [focusBoard] outlines one board (the editor's selected board).
 */
@Composable
fun ComboSudokuBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
    focusBoard: Int? = null,
    // The hinted next cell ("col,row"), or null when no hint is shown.
    hintCell: String? = null,
) {
    val layout = remember(puzzle.id, puzzle.canonRepr) { ComboSudokuEngine.layout(puzzle) }
    val conflicts = if (liveValidate) layout.conflicts(userValues) else emptySet()

    ZoomableBoard(
        cols = layout.cols,
        rows = layout.rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            val key = "$col,$row"
            if (key !in layout.cells || key in layout.givens) return@ZoomableBoard
            onSelectCell(if (selectedCell == key) null else key)
        },
    ) { cell ->
        for (key in layout.cells) {
            val (c, r) = key.split(",").map { it.toInt() }
            drawRect(COMBO_BG, Offset(c * cell, r * cell), Size(cell, cell))
        }
        hintCell?.let { fillCell(it, cell, COMBO_HINT) }
        selectedCell?.let { sel ->
            for (peer in layout.peers[sel].orEmpty()) fillCell(peer, cell, COMBO_PEER)
            fillCell(sel, cell, COMBO_SELECT)
        }
        drawComboLines(layout, cell, thin = 1.dp.toPx(), medium = 2.dp.toPx(), thick = 3.dp.toPx())
        focusBoard?.let { layout.subboards.getOrNull(it) }?.let { sb ->
            val w = 4.dp.toPx()
            drawRect(
                COMBO_FOCUS_BOARD,
                Offset(sb.col0 * cell + w / 2, sb.row0 * cell + w / 2),
                Size(9 * cell - w, 9 * cell - w),
                style = Stroke(w),
            )
        }

        val textSize = cell * 0.55f
        val noteSize = cell / 3f * 0.8f
        for (key in layout.cells) {
            val (c, r) = key.split(",").map { it.toInt() }
            val given = layout.givens[key]
            val entered = userValues[key] ?: 0
            when {
                given != null -> comboText(given.toString(), c * cell + cell / 2, r * cell + cell / 2, textSize,
                    if (key in conflicts) COMBO_CONFLICT else COMBO_GIVEN, bold = true)
                entered > 0 -> comboText(entered.toString(), c * cell + cell / 2, r * cell + cell / 2, textSize,
                    if (key in conflicts) COMBO_CONFLICT else COMBO_USER, bold = false)
                else -> for (d in 1..9) {
                    if (userValues["n:$key:$d"] != 1) continue
                    val third = cell / 3f
                    comboText(d.toString(), c * cell + ((d - 1) % 3 + 0.5f) * third,
                        r * cell + ((d - 1) / 3 + 0.5f) * third, noteSize, COMBO_NOTE, bold = false)
                }
            }
        }
    }
}

/**
 * A small, non-interactive preview of a combo sudoku's shape and givens (an Admin
 * batch tile), red-tinted when [hasProblems].
 */
@Composable
fun ComboSudokuMiniBoard(
    layout: ComboSudokuEngine.Layout,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        if (layout.cells.isEmpty()) return@Canvas
        val cell = minOf(this.size.width / layout.cols, this.size.height / layout.rows)
        for (key in layout.cells) {
            val (c, r) = key.split(",").map { it.toInt() }
            drawRect(if (hasProblems) MINI_PROBLEM_TINT else COMBO_BG, Offset(c * cell, r * cell), Size(cell, cell))
        }
        drawComboLines(layout, cell, thin = 0.3.dp.toPx(), medium = 0.8.dp.toPx(), thick = 1.2.dp.toPx())
        if (cell >= 5.dp.toPx()) {
            for ((key, v) in layout.givens) {
                val (c, r) = key.split(",").map { it.toInt() }
                comboText(v.toString(), c * cell + cell / 2, r * cell + cell / 2, cell * 0.62f, COMBO_GIVEN, bold = false)
            }
        }
    }
}

/**
 * Every covered cell's four edges: thick where the shape ends, medium on a room line
 * (rooms are global, every 3 cells, since boards sit on whole rooms), thin elsewhere.
 * Drawn thin -> medium -> thick so heavier lines win where edges coincide.
 */
private fun DrawScope.drawComboLines(
    layout: ComboSudokuEngine.Layout,
    cell: Float,
    thin: Float,
    medium: Float,
    thick: Float,
) {
    val cells = layout.cells
    val edges = mutableListOf<Triple<Offset, Offset, Float>>()
    for (key in cells) {
        val (c, r) = key.split(",").map { it.toInt() }
        val x0 = c * cell
        val y0 = r * cell
        val x1 = x0 + cell
        val y1 = y0 + cell
        fun weight(neighbour: String, onRoomLine: Boolean) = when {
            neighbour !in cells -> thick
            onRoomLine -> medium
            else -> thin
        }
        edges += Triple(Offset(x0, y0), Offset(x1, y0), weight("$c,${r - 1}", r % 3 == 0))
        edges += Triple(Offset(x0, y1), Offset(x1, y1), weight("$c,${r + 1}", (r + 1) % 3 == 0))
        edges += Triple(Offset(x0, y0), Offset(x0, y1), weight("${c - 1},$r", c % 3 == 0))
        edges += Triple(Offset(x1, y0), Offset(x1, y1), weight("${c + 1},$r", (c + 1) % 3 == 0))
    }
    for (w in listOf(thin, medium, thick)) {
        for ((a, b, stroke) in edges) if (stroke == w) drawLine(COMBO_LINE, a, b, stroke)
    }
}

private fun DrawScope.fillCell(key: String, cell: Float, color: Color) {
    val (c, r) = key.split(",").map { it.toInt() }
    drawRect(color, Offset(c * cell + 1, r * cell + 1), Size(cell - 2, cell - 2))
}

private fun DrawScope.comboText(text: String, cx: Float, cy: Float, size: Float, color: Color, bold: Boolean) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = size
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = if (bold) {
            android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        } else {
            android.graphics.Typeface.DEFAULT
        }
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
