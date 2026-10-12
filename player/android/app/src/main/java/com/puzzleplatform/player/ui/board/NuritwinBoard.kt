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

/** Which mark a paint stroke lays down: a black cell, or a white solver dot. */
enum class NuritwinMode { BLACK, MARK }

// Light-grey board so black fills and white-marked dots both read clearly.
private val GRID_BG = Color(0xFFEEEEEE)
private val LINE_THIN = Color(0xFFAAAAAA)
private val LINE_THICK = Color.Black
private val BLACK_FILL = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF888888)
private val CLUE_COLOR = Color.Black
private val CLUE_ON_BLACK = Color.White

/**
 * Compose Canvas renderer for Nuritwin (puzzle type 9), the analog of
 * frontend/src/components/NuritwinBoard.tsx.
 *
 * The grid is pre-divided into rooms by thick borders (drawn from the canon grids, like
 * [NurimazeBoard]); some rooms carry a positive integer clue in one cell. Unlike Nurimaze,
 * input is cell-level drag-to-paint like [NurikabeBoard] — touch has no right-click, so a
 * [mode] toggle (rendered as chips by the caller) picks whether a stroke lays down a black
 * cell or a white solver dot. One finger paints (a stroke that starts on an already-set
 * cell erases uniformly); two fingers pan/zoom via [ZoomableBoard]. Every cell is
 * paintable — a clue is a room-size constraint, not a fixed-white cell.
 *
 * Black cells render as a dark fill; marked cells show a small centered dot. Clue numbers
 * are drawn on top, flipping to white when their cell is painted black.
 */
@Composable
fun NuritwinBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    mode: NuritwinMode,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val canon = remember(puzzle.id) { NuritwinEngine.parseCanon(puzzle) }
    val rows = canon.rows
    val cols = canon.cols
    if (rows == 0 || cols == 0) return

    // The gesture closures below outlive a recomposition (ZoomableBoard's pointerInput
    // doesn't restart when these change), so read the freshest values through state.
    val modeState = rememberUpdatedState(mode)
    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetCell)

    val drag = remember(puzzle.id) { NuritwinDragState() }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            drag.paintSingle(col, row, modeState.value, valuesState.value) { c, r, st -> onSet.value(c, r, st) }
        },
        onDrawStart = { cell ->
            drag.start(cell, modeState.value, valuesState.value) { col, row, st -> onSet.value(col, row, st) }
        },
        onDrawTo = { cell ->
            drag.moveTo(cell) { col, row, st -> onSet.value(col, row, st) }
        },
        onDrawEnd = { drag.end() },
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
                        BLACK_FILL,
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

        // Clue numbers on top; white when the cell is painted black, else black.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = canon.cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (clue <= 0) continue
                val onBlack = (values[NuritwinEngine.cellKey(c, r)] ?: NuritwinEngine.UNSET) == NuritwinEngine.BLACK
                drawClue(clue, c, r, cell, if (onBlack) CLUE_ON_BLACK else CLUE_COLOR)
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

/**
 * Tracks a single paint gesture (port of [NurikabeDragState]). The first cell fixes the
 * target state — lay down the active mode's mark, or erase if that cell already holds it —
 * then every cell the finger enters is set to that same target, so a stroke paints or
 * erases uniformly.
 */
private class NuritwinDragState {
    private var last: Pair<Int, Int>? = null
    private var target: Int = NuritwinEngine.UNSET

    private fun markFor(mode: NuritwinMode) =
        if (mode == NuritwinMode.MARK) NuritwinEngine.MARKED else NuritwinEngine.BLACK

    fun start(cell: Pair<Int, Int>?, mode: NuritwinMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null) { last = null; return }
        val (c, r) = cell
        val mark = markFor(mode)
        val current = values[NuritwinEngine.cellKey(c, r)] ?: NuritwinEngine.UNSET
        target = if (current == mark) NuritwinEngine.UNSET else mark
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
    fun paintSingle(c: Int, r: Int, mode: NuritwinMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val mark = markFor(mode)
        val current = values[NuritwinEngine.cellKey(c, r)] ?: NuritwinEngine.UNSET
        set(c, r, if (current == mark) NuritwinEngine.UNSET else mark)
    }
}
