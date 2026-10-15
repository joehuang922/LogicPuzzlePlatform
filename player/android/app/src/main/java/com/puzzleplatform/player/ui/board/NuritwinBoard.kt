package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.NuritwinEngine

// Light-grey board so shaded fills and white-marked dots both read clearly.
private val GRID_BG = Color(0xFFEEEEEE)
private val LINE_THIN = Color(0xFFAAAAAA)
private val LINE_THICK = Color.Black
private val MARK_COLOR = Color(0xFF888888)
private val CLUE_COLOR = Color.Black

/**
 * Compose Canvas renderer for Nuritwin (puzzle type 9), the analog of
 * frontend/src/components/NuritwinBoard.tsx.
 *
 * The grid is pre-divided into rooms by thick borders (drawn from the canon grids, like
 * [NurimazeBoard]); some rooms carry a positive integer clue in one cell. Unlike Nurimaze,
 * input is cell-level: the shared shade/mark tap-to-cycle
 * ([com.puzzleplatform.player.puzzle.ShadeCycle]) advances the tapped cell empty -> black
 * -> white mark -> empty, applied by the caller via [onTapCell]. Two fingers pan/zoom via
 * [ZoomableBoard]. Every cell is tappable — a clue is a room-size constraint, not a
 * fixed-white cell.
 *
 * Black cells render as [BoardColors.ROOM_SHADE] so the room borders stay visible; marked
 * cells show a small centered dot. Clue numbers are drawn on top in black, which reads on
 * both the board and the shade.
 */
@Composable
fun NuritwinBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val canon = remember(puzzle.id) { NuritwinEngine.parseCanon(puzzle) }
    val rows = canon.rows
    val cols = canon.cols
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        val values = valuesState.value

        // Cell contents: a black fill or a centered white-mark dot.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (values[NuritwinEngine.cellKey(c, r)] ?: NuritwinEngine.UNSET) {
                    NuritwinEngine.BLACK -> drawRect(
                        BoardColors.ROOM_SHADE,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    NuritwinEngine.MARKED -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.12f,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                    )
                }
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()

        // Horizontal lines: thick on the outer border or where the canon marks a room
        // border below the cell above it (h[r-1][c]); otherwise a thin cell divider.
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val isThick = isBorder || (canon.h.getOrNull(r - 1)?.getOrNull(c) ?: 0) == 1
                drawLine(
                    if (isThick) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (isThick) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
        }
        // Vertical lines: thick on the outer border or where the canon marks a room border
        // right of the cell to its left (v[r][c-1]).
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            for (r in 0 until rows) {
                val isThick = isBorder || (canon.v.getOrNull(r)?.getOrNull(c - 1) ?: 0) == 1
                drawLine(
                    if (isThick) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (isThick) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
        }

        // Clue numbers on top, black on both the board and the shade.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = canon.cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (clue <= 0) continue
                drawClue(clue, c, r, cell, CLUE_COLOR)
            }
        }
    }
}

/** Draw a (possibly multi-digit) clue number centered in cell (col, row). */
private fun DrawScope.drawClue(value: Int, col: Int, row: Int, cell: Float, color: Color) {
    val digits = value.toString().length
    val textSize = cell * when {
        digits <= 1 -> 0.5f
        digits == 2 -> 0.38f
        else -> 0.28f
    }
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
