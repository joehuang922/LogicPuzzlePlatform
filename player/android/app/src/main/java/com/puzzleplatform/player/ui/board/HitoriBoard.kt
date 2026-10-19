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
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HitoriEngine

// White board. Hitori has no rooms, so shaded cells use a solid black fill with white
// numbers (the number must stay readable to check remaining duplicates), matching the web
// board's SHADE_FILL/SHADE_TEXT.
private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFAAAAAA)
private val LINE_THICK = Color.Black
private val SHADE_FILL = Color.Black
private val SHADE_TEXT = Color.White
private val NUM_COLOR = Color.Black
private val MARK_COLOR = Color.Black

/**
 * Compose Canvas renderer for Hitori (puzzle type 26), the analog of
 * frontend/src/components/HitoriBoard.tsx.
 *
 * A plain rectangular grid where every cell holds a positive integer and every cell is
 * playable (no read-only clues). Input is the shared shade/mark tap-to-cycle
 * ([com.puzzleplatform.player.puzzle.ShadeCycle]): each tap advances a cell empty -> shaded
 * -> marked -> empty, and the caller applies it via [onTapCell]. Shaded cells fill black
 * with a white number; marked cells draw a circle around the number. Two fingers pan/zoom
 * via [ZoomableBoard].
 */
@Composable
fun HitoriBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { HitoriEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
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

        // Shaded cells: a solid black fill. (Marks are drawn after the numbers.)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((valuesState.value[HitoriEngine.cellKey(c, r)] ?: HitoriEngine.UNSET) == HitoriEngine.SHADED) {
                    drawRect(
                        SHADE_FILL,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                }
            }
        }

        // Gridlines: thin interior dividers, thick outer border.
        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            drawLine(
                if (isBorder) LINE_THICK else LINE_THIN,
                Offset(0f, r * cell),
                Offset(boardW, r * cell),
                strokeWidth = if (isBorder) thick else thin,
                cap = StrokeCap.Square,
            )
        }
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            drawLine(
                if (isBorder) LINE_THICK else LINE_THIN,
                Offset(c * cell, 0f),
                Offset(c * cell, boardH),
                strokeWidth = if (isBorder) thick else thin,
                cap = StrokeCap.Square,
            )
        }

        // Marked cells: a circle around the number.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((valuesState.value[HitoriEngine.cellKey(c, r)] ?: HitoriEngine.UNSET) == HitoriEngine.MARKED) {
                    drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.4f,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                        style = Stroke(width = 1.5.dp.toPx()),
                    )
                }
            }
        }

        // Numbers on top, white on a shaded cell and black otherwise.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val value = cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (value <= 0) continue
                val shaded = (valuesState.value[HitoriEngine.cellKey(c, r)] ?: HitoriEngine.UNSET) == HitoriEngine.SHADED
                drawNumber(value, c, r, cell, if (shaded) SHADE_TEXT else NUM_COLOR)
            }
        }
    }
}

/** Draw a (possibly multi-digit) number centered in cell (col, row). */
private fun DrawScope.drawNumber(value: Int, col: Int, row: Int, cell: Float, color: Color) {
    val digits = value.toString().length
    val textSize = cell * when {
        digits <= 1 -> 0.5f
        digits == 2 -> 0.4f
        else -> 0.3f
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
