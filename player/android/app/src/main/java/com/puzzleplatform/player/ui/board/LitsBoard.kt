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
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.LitsEngine

/** Which mark a paint stroke lays down: a shade (black) or a solver-aid dot. */
enum class LitsMode { SHADE, MARK }

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFBBBBBB)
private val LINE_THICK = Color.Black
private val SHADE_COLOR = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF444444)

/**
 * Compose Canvas renderer for LITS (puzzle type 15), the analog of
 * frontend/src/components/LitsBoard.tsx.
 *
 * The grid is pre-divided into regions by thick borders (drawn from the canon grids,
 * like [FillominoBoard]); the player shades one L/I/T/S tetromino per region. Input is
 * drag-to-paint like [NonogramBoard] — touch has no right-click, so a [mode] toggle
 * (rendered as chips by the caller) picks whether a stroke lays down a shade or a
 * solver-aid dot. One finger paints (a stroke that starts on an already-set cell erases
 * uniformly); two fingers pan/zoom via [ZoomableBoard].
 */
@Composable
fun LitsBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    mode: LitsMode,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val grids = remember(puzzle.id) { LitsEngine.parseGrids(puzzle) }
    val rows = grids.rows
    val cols = grids.cols
    if (rows <= 0 || cols <= 0) return

    // The gesture closures below outlive a recomposition (ZoomableBoard's pointerInput
    // doesn't restart when these change), so read the freshest values through state.
    val modeState = rememberUpdatedState(mode)
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetCell)

    val drag = remember(puzzle.id) { LitsDragState() }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            drag.paintSingle(col, row, modeState.value, valuesState.value) { c, r, st -> onSet.value(c, r, st) }
        },
        onDrawStart = { cell ->
            drag.start(cell, modeState.value, valuesState.value) { c, r, st -> onSet.value(c, r, st) }
        },
        onDrawTo = { cell -> drag.moveTo(cell) { c, r, st -> onSet.value(c, r, st) } },
        onDrawEnd = { drag.end() },
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

/**
 * Tracks a single paint gesture (port of [NonogramBoard]'s NonogramDragState). The first
 * cell fixes the target state — lay down the active mode's mark, or erase if that cell
 * already holds it — then every cell the finger enters is set to that same target, so a
 * stroke paints or erases uniformly.
 */
private class LitsDragState {
    private var last: Pair<Int, Int>? = null
    private var target: Int = LitsEngine.UNSET

    private fun markFor(mode: LitsMode) =
        if (mode == LitsMode.MARK) LitsEngine.MARKED else LitsEngine.SHADED

    fun start(cell: Pair<Int, Int>?, mode: LitsMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null) { last = null; return }
        val (c, r) = cell
        val mark = markFor(mode)
        val current = values[LitsEngine.cellKey(c, r)] ?: LitsEngine.UNSET
        target = if (current == mark) LitsEngine.UNSET else mark
        set(c, r, target)
        last = cell
    }

    fun moveTo(cell: Pair<Int, Int>?, set: (Int, Int, Int) -> Unit) {
        if (cell == null || cell == last) return
        set(cell.first, cell.second, target)
        last = cell
    }

    fun end() { last = null }

    /** A tap (no drag): toggle the single cell for the active mode. */
    fun paintSingle(c: Int, r: Int, mode: LitsMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val mark = markFor(mode)
        val current = values[LitsEngine.cellKey(c, r)] ?: LitsEngine.UNSET
        set(c, r, if (current == mark) LitsEngine.UNSET else mark)
    }
}
