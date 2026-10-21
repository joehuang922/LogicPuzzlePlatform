package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlin.math.round

// Preview palette, as in Nonogram's: the ground is a mid grey so it can't be mistaken
// for a white cell of the picture.
private val PREVIEW_BG = Color(0xFFD9D9D9)
private val PREVIEW_BORDER = Color(0xFFAAAAAA)
/** The web boards' preview box is ~160px; cells there are 3..8px. */
private val PREVIEW_MAX = 96.dp

/**
 * Small aspect-preserving preview of a picture puzzle's emerging image (the web boards'
 * thumbnail), drawn above the board. [picture] is row-major packed ARGB, the same cells
 * the collection thumbnail shows once solved; cells equal to [ground] are left as the
 * preview's grey background.
 */
@Composable
fun PicturePreview(picture: IntArray, rows: Int, cols: Int, ground: Int) {
    val longest = maxOf(rows, cols)
    Canvas(
        Modifier
            .size(PREVIEW_MAX * cols / longest, PREVIEW_MAX * rows / longest)
            .border(1.dp, PREVIEW_BORDER),
    ) {
        val cell = minOf(size.width / cols, size.height / rows)
        drawRect(PREVIEW_BG)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val argb = picture[r * cols + c]
                if (argb == ground) continue
                // Snap to whole pixels so adjacent same-color cells abut exactly; with
                // fractional bounds their anti-aliased edges show up as faint gridlines.
                val left = round(c * cell)
                val top = round(r * cell)
                drawRect(
                    Color(argb),
                    Offset(left, top),
                    Size(round((c + 1) * cell) - left, round((r + 1) * cell) - top),
                )
            }
        }
    }
}
