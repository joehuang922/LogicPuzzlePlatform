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
import com.puzzleplatform.player.puzzle.MelonPieEngine

private val MINI_BG = Color.White
private val MINI_LINE = Color(0xFFCCCCCC)
private val MINI_OUTLINE = Color(0xFF222222)
private val MINI_PROBLEM = Color(0xFFDD3333)

/** A tiny, non-interactive Melon Pie preview for an Admin batch tile: lattice and circles, framed red on problems. */
@Composable
fun MelonPieMiniBoard(
    draft: MelonPieEngine.Board,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        if (draft.width < 1 || draft.height < 1) return@Canvas
        val box = minOf(this.size.width, this.size.height)
        // One step per point, the lattice centred with half a step around it.
        val step = box / (maxOf(draft.width, draft.height) + 1)
        val left = (box - step * draft.width) / 2
        val top = (box - step * draft.height) / 2
        drawRect(MINI_BG, Offset.Zero, Size(box, box))
        for (r in 0..draft.height) {
            drawLine(MINI_LINE, Offset(left, top + r * step), Offset(left + draft.width * step, top + r * step), 1f)
        }
        for (c in 0..draft.width) {
            drawLine(MINI_LINE, Offset(left + c * step, top), Offset(left + c * step, top + draft.height * step), 1f)
        }
        for (k in draft.circles) {
            val center = Offset(left + k.c * step, top + k.r * step)
            drawCircle(MELON_CIRCLE_FILL.getOrElse(k.color) { Color.White }, step * 0.25f, center)
            drawCircle(MINI_OUTLINE, step * 0.25f, center, style = Stroke(1f))
        }
        if (hasProblems) drawRect(MINI_PROBLEM, Offset.Zero, Size(box, box), style = Stroke(3.dp.toPx()))
    }
}
