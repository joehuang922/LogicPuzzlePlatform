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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.NurimazeEngine

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFBBBBBB)
private val LINE_THICK = Color.Black
private val BLACK_FILL = Color(0xFF333333)
private val MARK_DOT = Color.Black
private val SYMBOL_COLOR = Color(0xFF111111)

/**
 * Compose Canvas renderer for Nurimaze (puzzle type 3), the analog of
 * frontend/src/components/NurimazeBoard.tsx.
 *
 * The grid is pre-divided into rooms by thick borders (drawn from the canon grids, like
 * [LitsBoard]). Input is room-level tap-to-cycle: tapping any cell cycles its whole room
 * (empty -> black -> marked -> empty for normal rooms; empty <-> marked for rooms that
 * hold a special symbol, which can't be painted black). There's no drag, no mode toggle,
 * and no cell selection — [onCycleRoom] receives the tapped (col, row) and the caller
 * expands it to the room via the engine. One finger taps; two fingers pan/zoom.
 *
 * Black rooms render as a dark fill; marked cells show a small centered dot. Symbols
 * (circle, triangle, S, G) are drawn centered in their cells, on top of fills.
 */
@Composable
fun NurimazeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onCycleRoom: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val canon = remember(puzzle.id) { NurimazeEngine.parseCanon(puzzle) }
    val rows = canon.rows
    val cols = canon.cols
    if (rows == 0 || cols == 0) return

    // The tap closure outlives recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onCycle = rememberUpdatedState(onCycleRoom)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onCycle.value(col, row) },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        val values = valuesState.value

        // Cell fills (black) and mark dots.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (values[NurimazeEngine.cellKey(c, r)] ?: NurimazeEngine.UNSET) {
                    NurimazeEngine.BLACK -> drawRect(
                        BLACK_FILL,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    NurimazeEngine.MARKED -> drawCircle(
                        MARK_DOT,
                        radius = cell * 0.09f,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                    )
                }
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()

        // Horizontal lines: grid-line row r (y = r*cell), one segment per column. Thick on
        // the outer border or where the canon marks a room border below the cell above it
        // (h[r-1][c]); otherwise a thin cell divider.
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
        // Vertical lines: grid-line col c (x = c*cell), one segment per row. Thick on the
        // outer border or where the canon marks a room border right of the cell to its
        // left (v[r][c-1]).
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

        // Symbols on top. A circle/triangle outline, or a bold S/G glyph, centered in-cell.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val cx = c * cell + cell / 2
                val cy = r * cell + cell / 2
                when (canon.cells.getOrNull(r)?.getOrNull(c) ?: 0) {
                    1 -> drawCircle( // circle (waypoint)
                        SYMBOL_COLOR,
                        radius = cell * 0.28f,
                        center = Offset(cx, cy),
                        style = Stroke(width = cell * 0.05f),
                    )
                    2 -> { // triangle (forbidden waypoint)
                        val s = cell * 0.3f
                        val path = Path().apply {
                            moveTo(cx, cy - s)
                            lineTo(cx - s * 0.87f, cy + s * 0.5f)
                            lineTo(cx + s * 0.87f, cy + s * 0.5f)
                            close()
                        }
                        drawPath(path, SYMBOL_COLOR, style = Stroke(width = cell * 0.05f))
                    }
                    3 -> drawGlyph("S", cx, cy, cell)
                    4 -> drawGlyph("G", cx, cy, cell)
                }
            }
        }
    }
}

/** Draw a bold single-character glyph (S/G) centered at (cx, cy). */
private fun DrawScope.drawGlyph(text: String, cx: Float, cy: Float, cell: Float) {
    val paint = android.graphics.Paint().apply {
        color = SYMBOL_COLOR.toArgb()
        textSize = cell * 0.5f
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
