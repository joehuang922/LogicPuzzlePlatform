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
import com.puzzleplatform.player.puzzle.NorinoriEngine

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFBBBBBB)
private val LINE_THICK = Color.Black
private val MARK_COLOR = Color(0xFF444444)

/**
 * Compose Canvas renderer for Norinori (puzzle type 23), the analog of
 * frontend/src/components/NorinoriBoard.tsx.
 *
 * The grid is pre-divided into regions by thick borders (drawn from the canon grids, like
 * [LitsBoard]); the player shades two cells per region so all shaded cells form dominoes.
 * There are no clue cells. Input is the shared shade/mark tap-to-cycle
 * ([com.puzzleplatform.player.puzzle.ShadeCycle]), mirroring the web board's left-click:
 * each tap advances the cell empty -> shaded -> marked -> empty, applied by the caller via
 * [onTapCell], so there's no fill/mark mode. "shaded" is the rule-bearing fill; "marked" is
 * a centered solver-aid dot. One finger taps a cell; two fingers pan/zoom via
 * [ZoomableBoard]. Shaded cells render as [BoardColors.ROOM_SHADE] so the region borders
 * stay visible.
 */
@Composable
fun NorinoriBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val grids = remember(puzzle.id) { NorinoriEngine.parseGrids(puzzle) }
    val rows = grids.rows
    val cols = grids.cols
    if (rows <= 0 || cols <= 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values through state.
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

        // Cell contents: shaded fill or a centered mark dot.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (valuesState.value[NorinoriEngine.cellKey(c, r)] ?: NorinoriEngine.EMPTY) {
                    NorinoriEngine.SHADED -> drawRect(
                        BoardColors.ROOM_SHADE,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    NorinoriEngine.MARKED -> drawCircle(
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
