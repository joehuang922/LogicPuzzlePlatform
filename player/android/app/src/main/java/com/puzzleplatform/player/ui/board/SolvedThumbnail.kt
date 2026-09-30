package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.PuzzleThumbnail

private val THUMB_BORDER = Color(0xFFCCCCCC)
private val THUMB_BG = Color.White

/**
 * Draws a [PuzzleThumbnail] (a grid of packed-ARGB cells) as a tiny square preview of a
 * solved puzzle's picture, for the collection view. Aspect-preserving and centered on a
 * white ground with a light border, matching the on-board preview corner. Cells whose
 * color is 0 (transparent) are skipped, so only the picture shows.
 */
@Composable
fun SolvedThumbnail(thumbnail: PuzzleThumbnail, modifier: Modifier = Modifier, size: Dp = 36.dp) {
    Canvas(
        modifier
            .size(size)
            .border(1.dp, THUMB_BORDER),
    ) {
        drawRect(THUMB_BG)
        val cols = thumbnail.width
        val rows = thumbnail.height
        if (cols <= 0 || rows <= 0) return@Canvas

        // Fit the grid inside the square, preserving aspect, and center it.
        val cell = minOf(this.size.width / cols, this.size.height / rows)
        if (cell <= 0f) return@Canvas
        val ox = (this.size.width - cell * cols) / 2
        val oy = (this.size.height - cell * rows) / 2

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val argb = thumbnail.cells[r * cols + c]
                if (argb == 0) continue
                drawRect(Color(argb), Offset(ox + c * cell, oy + r * cell), Size(cell, cell))
            }
        }
    }
}
