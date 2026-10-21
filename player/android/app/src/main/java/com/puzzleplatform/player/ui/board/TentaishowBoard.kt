package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.TentaishowEngine

private val LINE = Color.Black
private val DOT_DARK = Color(0xFF111111)

/**
 * Compose Canvas renderer for Tentai Show / Spiral Galaxies (puzzle type 20), the analog
 * of frontend/src/components/TentaishowBoard.tsx.
 *
 * Input is a single gesture: tap near an interior grid line to toggle the wall on it. The
 * tap snaps to the nearest interior line (the same [wallKeyAt] snap Fillomino's wall mode
 * uses — both types key walls "h:r,c"/"v:r,c"), so a thin line never has to be hit
 * precisely. Two fingers pan/zoom via [ZoomableBoard].
 *
 * Rendering mirrors the web board: a light-grey ground, every enclosed region holding
 * exactly one dot filled with that dot's color (white or black), dashed thin separators,
 * thick solid walls and border, and the dots on top at their doubled coordinates (cell
 * center, edge midpoint, or corner). Above the board sits a small live preview of the
 * emerging picture — the same cells the collection thumbnail shows once solved.
 */
@Composable
fun TentaishowBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onSetEdge: (key: String, on: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val board = remember(puzzle.id) { TentaishowEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows == 0 || cols == 0) return

    // Gesture closures outlive recomposition (ZoomableBoard's pointerInput doesn't restart
    // when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetEdge)

    // One flood-fill per input change, shared by the preview and the board shading.
    val picture = remember(board, userValues) { TentaishowEngine.pictureCells(board, userValues) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PicturePreview(picture, rows, cols, TentaishowEngine.GROUND_ARGB)

        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            onTapCell = { _, _ -> },
            onTapPrecise = { fx, fy ->
                val key = wallKeyAt(fx, fy, rows, cols) ?: return@ZoomableBoard
                onSet.value(key, valuesState.value[key] != 1)
            },
        ) { cell ->
            // Region shading (ground included): one rect per cell from the picture.
            for (r in 0 until rows) {
                for (c in 0 until cols) {
                    drawRect(
                        Color(picture[r * cols + c]),
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                }
            }

            val thin = 1.dp.toPx()
            val thick = 3.dp.toPx()
            val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.075f, cell * 0.075f))

            // Horizontal lines: line index r (y = r*cell), one segment per column.
            for (r in 0..rows) {
                val isBorder = r == 0 || r == rows
                for (c in 0 until cols) {
                    val solid = isBorder || userValues[TentaishowEngine.hKey(r - 1, c)] == 1
                    drawLine(
                        LINE,
                        Offset(c * cell, r * cell),
                        Offset((c + 1) * cell, r * cell),
                        strokeWidth = if (solid) thick else thin,
                        pathEffect = if (solid) null else dash,
                    )
                }
            }
            // Vertical lines: line index c (x = c*cell), one segment per row.
            for (c in 0..cols) {
                val isBorder = c == 0 || c == cols
                for (r in 0 until rows) {
                    val solid = isBorder || userValues[TentaishowEngine.vKey(r, c - 1)] == 1
                    drawLine(
                        LINE,
                        Offset(c * cell, r * cell),
                        Offset(c * cell, (r + 1) * cell),
                        strokeWidth = if (solid) thick else thin,
                        pathEffect = if (solid) null else dash,
                    )
                }
            }

            // Dots on top at doubled coordinates: pixel = (doubled / 2) * cell. A filled dot
            // gets a white ring so it still reads on a black-shaded region (web parity).
            val radius = cell * 0.18f
            val ring = 2.dp.toPx()
            for (dot in board.dots) {
                val center = Offset(dot.dc / 2f * cell, dot.dr / 2f * cell)
                val filled = dot.color == 1
                drawCircle(if (filled) DOT_DARK else Color.White, radius, center)
                drawCircle(if (filled) Color.White else DOT_DARK, radius, center, style = Stroke(ring))
            }
        }
    }
}
