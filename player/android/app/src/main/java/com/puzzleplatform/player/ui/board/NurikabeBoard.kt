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
import com.puzzleplatform.player.puzzle.NurikabeEngine

// Light-grey board so black fills and white-marked dots both read clearly, matching the
// web board's BOARD_BG.
private val GRID_BG = Color(0xFFEEEEEE)
private val LINE_THIN = Color(0xFFAAAAAA)
private val LINE_THICK = Color.Black
private val BLACK_FILL = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF888888)
private val CLUE_COLOR = Color.Black
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for Nurikabe (puzzle type 24), the analog of
 * frontend/src/components/NurikabeBoard.tsx.
 *
 * A plain rectangular grid where some cells carry a positive integer clue. Clue cells are
 * fixed white islands and read-only; every other cell is painted toward the solution.
 * Input is the shared shade/mark tap-to-cycle ([com.puzzleplatform.player.puzzle.ShadeCycle]):
 * each tap advances a cell empty -> black sea -> white-island mark -> empty, and the caller
 * applies it via [onTapCell]. Clue cells ignore taps. Two fingers pan/zoom via
 * [ZoomableBoard].
 *
 * The Admin review editor passes [selectedCell] ("col,row") to highlight the cell its
 * [onTapCell] selected.
 */
@Composable
fun NurikabeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { NurikabeEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)

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
        selectedState.value?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        // Cell contents: a black sea fill or a centered white-island mark dot. Clue cells
        // stay on the light background (they're always white islands).
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (NurikabeEngine.isClue(cells, r, c)) continue
                when (valuesState.value[NurikabeEngine.cellKey(c, r)] ?: NurikabeEngine.UNSET) {
                    NurikabeEngine.BLACK -> drawRect(
                        BLACK_FILL,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    NurikabeEngine.MARKED -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.12f,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
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

        // Clue numbers on top.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (clue > 0) drawClue(clue, c, r, cell)
            }
        }
    }
}

/** Draw a (possibly multi-digit) clue number centered in cell (col, row). */
private fun DrawScope.drawClue(value: Int, col: Int, row: Int, cell: Float) {
    val digits = value.toString().length
    val textSize = cell * when {
        digits <= 1 -> 0.5f
        digits == 2 -> 0.38f
        else -> 0.28f
    }
    val paint = android.graphics.Paint().apply {
        this.color = CLUE_COLOR.toArgb()
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
