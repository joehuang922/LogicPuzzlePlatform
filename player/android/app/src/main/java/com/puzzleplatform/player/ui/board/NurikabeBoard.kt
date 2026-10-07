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

/** Which mark a paint stroke lays down: a black sea cell, or a white-island solver dot. */
enum class NurikabeMode { BLACK, MARK }

// Light-grey board so black fills and white-marked dots both read clearly, matching the
// web board's BOARD_BG.
private val GRID_BG = Color(0xFFEEEEEE)
private val LINE_THIN = Color(0xFFAAAAAA)
private val LINE_THICK = Color.Black
private val BLACK_FILL = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF888888)
private val CLUE_COLOR = Color.Black

/**
 * Compose Canvas renderer for Nurikabe (puzzle type 24), the analog of
 * frontend/src/components/NurikabeBoard.tsx.
 *
 * A plain rectangular grid where some cells carry a positive integer clue. Clue cells are
 * fixed white islands and read-only; every other cell is painted toward the solution.
 * Input is drag-to-paint like [LitsBoard] — touch has no right-click, so a [mode] toggle
 * (rendered as chips by the caller) picks whether a stroke lays down a black sea cell or a
 * white-island solver dot. One finger paints (a stroke that starts on an already-set cell
 * erases uniformly); two fingers pan/zoom via [ZoomableBoard]. Clue cells ignore input.
 */
@Composable
fun NurikabeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    mode: NurikabeMode,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { NurikabeEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The gesture closures below outlive a recomposition (ZoomableBoard's pointerInput
    // doesn't restart when these change), so read the freshest values through state.
    val modeState = rememberUpdatedState(mode)
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetCell)
    val cellsState = rememberUpdatedState(cells)

    val drag = remember(puzzle.id) { NurikabeDragState() }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if (NurikabeEngine.isClue(cellsState.value, row, col)) return@ZoomableBoard
            drag.paintSingle(col, row, modeState.value, valuesState.value) { c, r, st -> onSet.value(c, r, st) }
        },
        onDrawStart = { cell ->
            // Starting a stroke on a clue cell is a no-op (clues are read-only).
            val startCell = cell?.takeUnless { NurikabeEngine.isClue(cellsState.value, it.second, it.first) }
            drag.start(startCell, modeState.value, valuesState.value) { col, row, st -> onSet.value(col, row, st) }
        },
        onDrawTo = { cell ->
            // Skip clue cells the finger passes over, but keep the stroke alive.
            val toCell = cell?.takeUnless { NurikabeEngine.isClue(cellsState.value, it.second, it.first) }
            drag.moveTo(toCell) { col, row, st -> onSet.value(col, row, st) }
        },
        onDrawEnd = { drag.end() },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Cell contents: a black sea fill or a centered white-island mark dot. Clue cells
        // stay on the light background (they're always white islands).
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (NurikabeEngine.isClue(cellsState.value, r, c)) continue
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

/**
 * Tracks a single paint gesture (port of [LitsBoard]'s LitsDragState). The first cell
 * fixes the target state — lay down the active mode's mark, or erase if that cell already
 * holds it — then every cell the finger enters is set to that same target, so a stroke
 * paints or erases uniformly. Clue cells are filtered out by the caller before reaching
 * here (passed as null), which pauses the stroke without ending it.
 */
private class NurikabeDragState {
    private var last: Pair<Int, Int>? = null
    private var target: Int = NurikabeEngine.UNSET

    private fun markFor(mode: NurikabeMode) =
        if (mode == NurikabeMode.MARK) NurikabeEngine.MARKED else NurikabeEngine.BLACK

    fun start(cell: Pair<Int, Int>?, mode: NurikabeMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null) { last = null; return }
        val (c, r) = cell
        val mark = markFor(mode)
        val current = values[NurikabeEngine.cellKey(c, r)] ?: NurikabeEngine.UNSET
        target = if (current == mark) NurikabeEngine.UNSET else mark
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
    fun paintSingle(c: Int, r: Int, mode: NurikabeMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val mark = markFor(mode)
        val current = values[NurikabeEngine.cellKey(c, r)] ?: NurikabeEngine.UNSET
        set(c, r, if (current == mark) NurikabeEngine.UNSET else mark)
    }
}
