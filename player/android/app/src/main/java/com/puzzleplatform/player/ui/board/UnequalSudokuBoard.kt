package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.UnequalSudokuEngine
import com.puzzleplatform.player.puzzle.UnequalSudokuEngine.Gap

private const val SIZE = 9

/** Gap between neighbouring squares, as a fraction of a square (as on web: 16 / 40). */
internal const val GAP_RATIO = 0.4f

/** Half the gap, as a fraction of a slot (one square plus a gap). */
internal const val SLOT_INSET = GAP_RATIO / 2f / (1f + GAP_RATIO)

private val PAGE_BG = Color.White
private val BOX_TINTS = listOf(Color(0xFFECE7EE), Color(0xFFF6F3F7))
private val CELL_BG = Color.White
private val OUTLINE = Color(0xFF3A2430)
private val SIGN = Color(0xFF3A2430)
private val HINT_COLOR = Color.Black
private val USER_COLOR = Color(0xFF888888)
private val NOTE_COLOR = Color(0xFF999999)
private val CONFLICT_COLOR = Color(0xFFD32F2F)
private val SELECT_FILL = Color(0xFFBBDEFB)
private val PEER_FILL = Color(0xFFE8F2FC)
private val HINT_FOCUS_FILL = Color(0xFFFFF59D)

/**
 * Compose Canvas renderer for unequal sudoku (type 29), the analog of
 * frontend/src/components/UnequalSudokuBoard.tsx, laid out like the print: each cell a
 * separate outlined square, the inequality signs in the gaps, and each 3x3 box on a
 * tinted backing plate (checkerboard of two tints).
 *
 * On [ZoomableBoard]'s 9x9 grid each slot is one square plus half a gap on every side,
 * so the signs sit on the slot boundaries and a tap anywhere in a slot is that cell.
 *
 * Play: tapping a non-given cell selects it (the caller shows a [DigitBar]). With
 * [liveValidate], repeats and cells around a broken sign are red, and so is the sign.
 *
 * Review (admin): [onTapGap] makes the gaps tappable — a tap near a slot boundary is
 * that gap's, the rest of the slot selects the cell. The review hands in a puzzle with
 * all-zero hints and the givens in [userValues], so every cell stays editable.
 */
@Composable
fun UnequalSudokuBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
    hintCell: String? = null,
    onTapGap: ((Gap) -> Unit)? = null,
) {
    val hints = remember(puzzle.id, puzzle.canonRepr) { UnequalSudokuEngine.parseHints(puzzle) }
    val signs = remember(puzzle.id, puzzle.canonRepr) { UnequalSudokuEngine.parseSigns(puzzle) }
    val conflicts = if (liveValidate) UnequalSudokuEngine.findConflicts(puzzle, userValues) else emptySet()
    val brokenSigns = if (liveValidate) UnequalSudokuEngine.findBrokenSigns(puzzle, userValues) else emptySet()

    fun tapCell(col: Int, row: Int) {
        if (hints[row][col] > 0) return // givens are locked
        val key = "$col,$row"
        onSelectCell(if (selectedCell == key) null else key)
    }

    ZoomableBoard(
        cols = SIZE,
        rows = SIZE,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> if (onTapGap == null) tapCell(col, row) },
        onTapPrecise = if (onTapGap == null) null else { fc, fr ->
            val gap = gapAt(fc, fr)
            if (gap != null) onTapGap(gap) else tapCell(fc.toInt().coerceIn(0, SIZE - 1), fr.toInt().coerceIn(0, SIZE - 1))
        },
    ) { slot ->
        val board = SIZE * slot
        val inset = slot * SLOT_INSET
        val square = slot - 2 * inset
        drawRect(PAGE_BG, size = Size(board, board))
        for (br in 0 until 3) for (bc in 0 until 3) {
            drawRect(
                BOX_TINTS[(br + bc) % 2],
                topLeft = Offset(bc * 3 * slot, br * 3 * slot),
                size = Size(3 * slot, 3 * slot),
            )
        }

        val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
        val outline = 1.2.dp.toPx()
        for (row in 0 until SIZE) {
            for (col in 0 until SIZE) {
                val key = "$col,$row"
                val fill = when {
                    selected != null && selected[0] == col && selected[1] == row -> SELECT_FILL
                    hintCell == key -> HINT_FOCUS_FILL
                    selected != null && isPeer(col, row, selected[0], selected[1]) -> PEER_FILL
                    else -> CELL_BG
                }
                val topLeft = Offset(col * slot + inset, row * slot + inset)
                drawRect(fill, topLeft = topLeft, size = Size(square, square))
                drawRect(OUTLINE, topLeft = topLeft, size = Size(square, square), style = Stroke(outline))
            }
        }

        // Signs on the slot boundaries.
        val gapPx = 2 * inset
        for (r in 0 until SIZE) for (c in 0 until SIZE - 1) {
            val gap = Gap(true, r, c)
            drawSign(signs.at(gap), true, (c + 1) * slot, r * slot + slot / 2, gapPx, if (gap in brokenSigns) CONFLICT_COLOR else SIGN)
        }
        for (r in 0 until SIZE - 1) for (c in 0 until SIZE) {
            val gap = Gap(false, r, c)
            drawSign(signs.at(gap), false, c * slot + slot / 2, (r + 1) * slot, gapPx, if (gap in brokenSigns) CONFLICT_COLOR else SIGN)
        }

        // Digits and pencil marks.
        val textSize = square * 0.58f
        for (row in 0 until SIZE) {
            for (col in 0 until SIZE) {
                val key = "$col,$row"
                val cx = col * slot + slot / 2
                val cy = row * slot + slot / 2
                val hint = hints[row][col]
                if (hint > 0) {
                    drawDigit(hint, cx, cy, textSize, if (key in conflicts) CONFLICT_COLOR else HINT_COLOR, bold = true)
                    continue
                }
                val entered = userValues[key] ?: 0
                if (entered > 0) {
                    drawDigit(entered, cx, cy, textSize, if (key in conflicts) CONFLICT_COLOR else USER_COLOR, bold = false)
                    continue
                }
                val third = square / 3f
                for (digit in 1..9) {
                    if (userValues["n:$key:$digit"] != 1) continue
                    val sub = digit - 1
                    drawDigit(
                        digit,
                        col * slot + inset + (sub % 3 + 0.5f) * third,
                        row * slot + inset + (sub / 3 + 0.5f) * third,
                        third * 0.8f,
                        NOTE_COLOR,
                        bold = false,
                    )
                }
            }
        }
    }
}

/**
 * The gap a fractional tap (in slot units) lands on, or null for a cell tap. A tap
 * within [GAP_TAP_ZONE] of an interior slot boundary is that gap's; near a corner the
 * closer boundary wins.
 */
internal fun gapAt(fc: Float, fr: Float): Gap? {
    val col = fc.toInt().coerceIn(0, SIZE - 1)
    val row = fr.toInt().coerceIn(0, SIZE - 1)
    val fx = fc - col
    val fy = fr - row
    // Distance to the nearest interior vertical / horizontal boundary, and that gap.
    val vertical: Pair<Float, Gap>? = when {
        fx < 0.5f && col > 0 -> fx to Gap(true, row, col - 1)
        fx >= 0.5f && col < SIZE - 1 -> (1f - fx) to Gap(true, row, col)
        else -> null
    }
    val horizontal: Pair<Float, Gap>? = when {
        fy < 0.5f && row > 0 -> fy to Gap(false, row - 1, col)
        fy >= 0.5f && row < SIZE - 1 -> (1f - fy) to Gap(false, row, col)
        else -> null
    }
    val best = listOfNotNull(vertical, horizontal).minByOrNull { it.first } ?: return null
    return if (best.first < GAP_TAP_ZONE) best.second else null
}

/** How close to a slot boundary (fraction of a slot) a tap counts as the gap's: the gap
 * itself plus a margin into the squares, since the gap alone is a thin target. */
internal const val GAP_TAP_ZONE = 0.24f

private fun isPeer(col: Int, row: Int, selCol: Int, selRow: Int): Boolean =
    col == selCol || row == selRow || (col / 3 == selCol / 3 && row / 3 == selRow / 3)

/**
 * A chevron centred at ([cx], [cy]) in a gap [gapPx] wide. [horizontal] gaps hold < / >,
 * vertical ones ∧ / ∨. [sign] 1: the tip faces the first cell (left / upper), 2: the
 * second; 0 draws nothing.
 */
internal fun DrawScope.drawSign(sign: Int, horizontal: Boolean, cx: Float, cy: Float, gapPx: Float, color: Color) {
    if (sign != 1 && sign != 2) return
    val depth = gapPx * 0.28f
    val spread = gapPx * 0.42f
    val dir = if (sign == 1) -1f else 1f
    val path = Path()
    if (horizontal) {
        path.moveTo(cx - dir * depth, cy - spread)
        path.lineTo(cx + dir * depth, cy)
        path.lineTo(cx - dir * depth, cy + spread)
    } else {
        path.moveTo(cx - spread, cy - dir * depth)
        path.lineTo(cx, cy + dir * depth)
        path.lineTo(cx + spread, cy - dir * depth)
    }
    drawPath(path, color, style = Stroke(width = gapPx * 0.15f, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

private fun DrawScope.drawDigit(value: Int, cx: Float, cy: Float, textSize: Float, color: Color, bold: Boolean) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = if (bold) {
            android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        } else {
            android.graphics.Typeface.DEFAULT
        }
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
