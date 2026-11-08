package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.UnequalSudokuDraft

private const val SIZE = 9
private val MINI_TINTS = listOf(Color(0xFFECE7EE), Color(0xFFF6F3F7))
private val MINI_INK = Color(0xFF3A2430)
private val PROBLEM_TINT = Color(0x33D32F2F)

/**
 * A tiny, non-interactive unequal sudoku preview for a batch tile: the print-style
 * squares and signs with the givens, tinted red when the draft has problems.
 */
@Composable
fun UnequalSudokuMiniBoard(
    draft: UnequalSudokuDraft,
    hasProblems: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 104.dp,
) {
    Canvas(modifier.size(size)) {
        val board = minOf(this.size.width, this.size.height)
        val slot = board / SIZE
        val inset = slot * SLOT_INSET
        val square = slot - 2 * inset
        for (br in 0 until 3) for (bc in 0 until 3) {
            drawRect(MINI_TINTS[(br + bc) % 2], Offset(bc * 3 * slot, br * 3 * slot), Size(3 * slot, 3 * slot))
        }
        val paint = android.graphics.Paint().apply {
            color = Color.Black.toArgb()
            textSize = square * 0.7f
            textAlign = android.graphics.Paint.Align.CENTER
            isAntiAlias = true
        }
        val fm = paint.fontMetrics
        for (r in 0 until SIZE) for (c in 0 until SIZE) {
            val topLeft = Offset(c * slot + inset, r * slot + inset)
            drawRect(Color.White, topLeft, Size(square, square))
            drawRect(MINI_INK, topLeft, Size(square, square), style = Stroke(0.5.dp.toPx()))
            val v = draft.givens["$c,$r"] ?: 0
            if (v in 1..9) {
                drawContext.canvas.nativeCanvas.drawText(
                    v.toString(), c * slot + slot / 2, r * slot + slot / 2 - (fm.ascent + fm.descent) / 2, paint,
                )
            }
        }
        val gapPx = 2 * inset
        for (r in 0 until SIZE) for (c in 0 until SIZE - 1) {
            drawSign(draft.right[r][c], true, (c + 1) * slot, r * slot + slot / 2, gapPx, MINI_INK)
        }
        for (r in 0 until SIZE - 1) for (c in 0 until SIZE) {
            drawSign(draft.down[r][c], false, c * slot + slot / 2, (r + 1) * slot, gapPx, MINI_INK)
        }
        if (hasProblems) drawRect(PROBLEM_TINT, size = Size(board, board))
    }
}
