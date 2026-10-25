package com.puzzleplatform.player.ui.board

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke

private val SELECT = Color(0xFF1976D2)

/**
 * Outline the cell an Admin review editor selected ([selectedCell] is "col,row"; null or
 * malformed draws nothing). Drawn last, as an outline rather than a fill, so it still
 * shows on dark clue/wall cells.
 */
internal fun DrawScope.drawCellSelection(selectedCell: String?, cell: Float) {
    val (c, r) = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 } ?: return
    val w = cell * 0.08f
    drawRect(SELECT, topLeft = Offset(c * cell + w / 2, r * cell + w / 2), size = Size(cell - w, cell - w), style = Stroke(width = w))
}
