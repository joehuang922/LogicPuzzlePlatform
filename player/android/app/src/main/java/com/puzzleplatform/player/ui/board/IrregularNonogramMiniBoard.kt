package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.IrregularNonogramEngine

private val MINI_BOARD = Color.White
private val MINI_CLUE = Color(0xFFCFCFCF)
private val MINI_EDGE = Color(0xFF444444)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive irregular nonogram preview for an Admin batch tile: the board's
 * shape (white) and its clue blocks (grey), framed in red when [hasProblems].
 */
@Composable
fun IrregularNonogramMiniBoard(
    draft: IrregularNonogramEngine.Board,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        if (draft.rows <= 0 || draft.cols <= 0) return@Canvas
        val b = IrregularNonogramEngine.layoutBounds(draft)
        val rows = b[2] - b[0] + 1
        val cols = b[3] - b[1] + 1
        val box = minOf(this.size.width, this.size.height)
        val cell = box / maxOf(rows, cols)
        val left = (box - cell * cols) / 2
        val top = (box - cell * rows) / 2
        fun at(r: Int, c: Int) = Offset(left + (c - b[1]) * cell, top + (r - b[0]) * cell)
        val segs = IrregularNonogramEngine.segments(draft).associateBy { it.key }
        for (clue in draft.clues) {
            val seg = segs[IrregularNonogramEngine.clueKey(clue)] ?: continue
            for ((r, c, _) in IrregularNonogramEngine.clueLayout(clue, seg.length)) drawRect(MINI_CLUE, at(r, c), Size(cell, cell))
        }
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            if (draft.cells[r][c]) drawRect(MINI_BOARD, at(r, c), Size(cell, cell))
        }
        val w = maxOf(0.6f, cell * 0.25f)
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            if (!draft.cells[r][c]) continue
            val p = at(r, c)
            if (!draft.isBoard(r - 1, c)) drawLine(MINI_EDGE, p, Offset(p.x + cell, p.y), w)
            if (!draft.isBoard(r + 1, c)) drawLine(MINI_EDGE, Offset(p.x, p.y + cell), Offset(p.x + cell, p.y + cell), w)
            if (!draft.isBoard(r, c - 1)) drawLine(MINI_EDGE, p, Offset(p.x, p.y + cell), w)
            if (!draft.isBoard(r, c + 1)) drawLine(MINI_EDGE, Offset(p.x + cell, p.y), Offset(p.x + cell, p.y + cell), w)
        }
        if (hasProblems) {
            drawRect(MINI_PROBLEM, Offset(left, top), Size(cols * cell, rows * cell), style = Stroke(3.dp.toPx()))
        }
    }
}
