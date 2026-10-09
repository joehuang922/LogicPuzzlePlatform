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
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.LitsEngine

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFBBBBBB)
private val LINE_THICK = Color.Black
// Medium gray: clearly shaded, yet light enough that the black region borders
// read through it (the dark #333 used before buried the room boundaries).
private val SHADE_COLOR = Color(0xFF9E9E9E)
private val MARK_COLOR = Color(0xFF444444)

/**
 * Compose Canvas renderer for LITS (puzzle type 15), the analog of
 * frontend/src/components/LitsBoard.tsx.
 *
 * The grid is pre-divided into regions by thick borders (drawn from the canon grids,
 * like [FillominoBoard]); the player shades one L/I/T/S tetromino per region. Input is
 * tap-to-cycle, mirroring the web board's left-click: each tap advances the cell
 * empty -> shaded -> marked -> empty, so there's no fill/mark mode to switch between.
 * "shaded" is the rule-bearing fill; "marked" is a centered solver-aid dot. One finger
 * taps a cell; two fingers pan/zoom via [ZoomableBoard]. There is deliberately no
 * drag-to-paint — a sweep across shaded rooms would too easily clobber a careful fill.
 */
@Composable
fun LitsBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val grids = remember(puzzle.id) { LitsEngine.parseGrids(puzzle) }
    val rows = grids.rows
    val cols = grids.cols
    if (rows <= 0 || cols <= 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values through state.
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            // Cycle empty -> shaded -> marked -> empty (UNSET=0, SHADED=1, MARKED=2).
            val cur = valuesState.value[LitsEngine.cellKey(col, row)] ?: LitsEngine.UNSET
            onSet.value(col, row, (cur + 1) % 3)
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Cell contents: shaded fill or a centered mark dot.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (valuesState.value[LitsEngine.cellKey(c, r)] ?: LitsEngine.UNSET) {
                    LitsEngine.SHADED -> drawRect(
                        SHADE_COLOR,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    LitsEngine.MARKED -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.12f,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                    )
                }
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()

        // Horizontal lines: line index r (y = r*cell), one segment per column. A line is
        // thick on the outer border or where the canon marks a region border below the
        // cell above it (h[r-1][c]); otherwise it's a thin cell divider.
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val isThick = isBorder || (grids.h.getOrNull(r - 1)?.getOrNull(c) ?: 0) == 1
                drawLine(
                    if (isThick) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (isThick) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
        }
        // Vertical lines: line index c (x = c*cell), one segment per row. Thick on the
        // outer border or where the canon marks a region border right of the cell to its
        // left (v[r][c-1]).
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            for (r in 0 until rows) {
                val isThick = isBorder || (grids.v.getOrNull(r)?.getOrNull(c - 1) ?: 0) == 1
                drawLine(
                    if (isThick) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (isThick) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
        }
    }
}
