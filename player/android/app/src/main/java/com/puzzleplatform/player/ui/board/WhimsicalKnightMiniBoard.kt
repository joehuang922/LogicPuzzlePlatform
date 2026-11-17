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
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine

private val MINI_BG = Color.White
private val MINI_GRAY = Color(0xFF8C8C8C)
private val MINI_DOT = Color(0xFF111111)
private val MINI_OUTLINE = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/**
 * A tiny, non-interactive whimsical knight preview for an Admin batch tile: the dot
 * lattice, gray squares, circles and squares, framed in red when [hasProblems].
 */
@Composable
fun WhimsicalKnightMiniBoard(
    draft: WhimsicalKnightEngine.Board,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        val rows = draft.rows
        val cols = draft.cols
        if (rows < 2 || cols < 2) return@Canvas
        val box = minOf(this.size.width, this.size.height)
        // One spacing of margin round the outer dots (half on each side).
        val step = box / maxOf(rows, cols)
        val left = (box - step * (cols - 1)) / 2
        val top = (box - step * (rows - 1)) / 2
        fun at(dr: Int, dc: Int) = Offset(left + dc / 2f * step, top + dr / 2f * step)

        drawRect(MINI_BG, Offset.Zero, Size(box, box))
        val inset = step * 0.1f
        for (r in 0 until rows - 1) {
            for (c in 0 until cols - 1) {
                if (draft.isGray(r, c)) {
                    drawRect(MINI_GRAY, Offset(left + c * step + inset, top + r * step + inset), Size(step - 2 * inset, step - 2 * inset))
                }
            }
        }
        val ring = maxOf(1f, step * 0.05f)
        val half = step * 0.22f
        for ((isCircle, p) in draft.clues) {
            val center = at(p.dr, p.dc)
            if (isCircle) {
                drawCircle(MINI_BG, half, center)
                drawCircle(MINI_OUTLINE, half, center, style = Stroke(ring))
            } else {
                val tl = Offset(center.x - half, center.y - half)
                drawRect(MINI_BG, tl, Size(2 * half, 2 * half))
                drawRect(MINI_OUTLINE, tl, Size(2 * half, 2 * half), style = Stroke(ring))
            }
        }
        for (r in 0 until rows) for (c in 0 until cols) drawCircle(MINI_DOT, maxOf(1f, step * 0.07f), at(2 * r, 2 * c))
        if (hasProblems) drawRect(MINI_PROBLEM, Offset.Zero, Size(box, box), style = Stroke(3.dp.toPx()))
    }
}
