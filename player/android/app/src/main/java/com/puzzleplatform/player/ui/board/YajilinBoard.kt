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
import com.puzzleplatform.player.puzzle.ShadeCycle
import com.puzzleplatform.player.puzzle.YajilinEngine

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFBBBBBB)
// Yajilin has no rooms, so the near-black web fill doesn't hide any borders here.
private val BLACK_FILL = Color(0xFF333333)
private val MARK_COLOR = Color(0xFF999999)
private val LOOP_COLOR = Color(0xFF888888)
private val CLUE_TEXT = Color(0xFF222222)

/**
 * Compose Canvas renderer for Yajilin (puzzle type 13), the analog of
 * frontend/src/components/YajilinBoard.tsx.
 *
 * Two inputs share the one finger, split the same way the web board splits click vs drag:
 *  - a tap cycles the cell empty -> black -> marked -> empty, the shared shade/mark
 *    interaction ([onTapCell] -> PlayViewModel.tapShadeCell); clue cells ignore taps;
 *  - a drag draws the loop between cell centers. The first segment crossed fixes the
 *    stroke as draw or erase (erase when it was already drawn), like Masyu/Number Link.
 *    Drawing onto a marked cell clears its mark (in the same batch as the segment), and a
 *    segment is refused when either end is a clue, blackened, or already has two segments.
 * Two fingers pan/zoom via [ZoomableBoard].
 */
@Composable
fun YajilinBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { YajilinEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // ZoomableBoard's gesture closures outlive recomposition, so read the freshest
    // values and callbacks through state.
    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onApply = rememberUpdatedState(onApplyChanges)
    val drag = remember(puzzle.id) { YajilinDragState(cells, rows, cols) }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
        // ZoomableBoard reports (col, row); the drag state works in (row, col) to match
        // the row-first "h:r,c"/"v:r,c"/"b:r,c" keys, so swap at the boundary.
        onDrawStart = { cell -> drag.start(cell?.let { (c, r) -> r to c }) },
        onDrawTo = { cell ->
            drag.moveTo(cell?.let { (c, r) -> r to c }, valuesState.value) { onApply.value(it) }
        },
        onDrawEnd = { drag.end() },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        val values = valuesState.value
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        val gridW = 1.dp.toPx()
        for (r in 1 until rows) drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), gridW)
        for (c in 1 until cols) drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), gridW)

        // Cell states: black squares and mark dots.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (values[YajilinEngine.cellKey(c, r)]) {
                    ShadeCycle.SHADED -> drawRect(
                        BLACK_FILL,
                        topLeft = Offset(c * cell + gridW, r * cell + gridW),
                        size = Size(cell - 2 * gridW, cell - 2 * gridW),
                    )
                    ShadeCycle.MARKED -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.09f,
                        center = Offset((c + 0.5f) * cell, (r + 0.5f) * cell),
                    )
                }
            }
        }

        // Arrow clues.
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val clue = cells[r][c] ?: continue
                drawClue(clue, (c + 0.5f) * cell, (r + 0.5f) * cell, cell)
            }
        }

        // Loop segments on top.
        val loopW = cell * 0.09f
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (values[YajilinEngine.hKey(r, c)] != 1) continue
                val y = (r + 0.5f) * cell
                drawLine(LOOP_COLOR, Offset((c + 0.5f) * cell, y), Offset((c + 1.5f) * cell, y), loopW, cap = StrokeCap.Round)
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (values[YajilinEngine.vKey(r, c)] != 1) continue
                val x = (c + 0.5f) * cell
                drawLine(LOOP_COLOR, Offset(x, (r + 0.5f) * cell), Offset(x, (r + 1.5f) * cell), loopW, cap = StrokeCap.Round)
            }
        }

        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = 2.dp.toPx()))
    }
}

/**
 * Draw an arrow clue centered at (cx, cy), laid out like the web board: a left/right arrow
 * sits above the number; an up/down arrow sits to the right of it.
 */
private fun DrawScope.drawClue(clue: YajilinEngine.Clue, cx: Float, cy: Float, cell: Float) {
    val fs = cell * 0.34f
    fun paint(bold: Boolean) = android.graphics.Paint().apply {
        color = CLUE_TEXT.toArgb()
        textSize = fs
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        if (bold) typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val numPaint = paint(bold = true)
    val arrowPaint = paint(bold = false)
    val arrow = when (clue.dir) {
        YajilinEngine.Dir.UP -> "↑"
        YajilinEngine.Dir.DOWN -> "↓"
        YajilinEngine.Dir.LEFT -> "←"
        YajilinEngine.Dir.RIGHT -> "→"
    }
    // Baseline offset that vertically centers text on a given y.
    fun centered(p: android.graphics.Paint, y: Float) = y - (p.fontMetrics.ascent + p.fontMetrics.descent) / 2
    val canvas = drawContext.canvas.nativeCanvas
    val num = clue.num.toString()
    if (clue.dir == YajilinEngine.Dir.LEFT || clue.dir == YajilinEngine.Dir.RIGHT) {
        canvas.drawText(arrow, cx, centered(arrowPaint, cy - fs * 0.45f), arrowPaint)
        canvas.drawText(num, cx, centered(numPaint, cy + fs * 0.55f), numPaint)
    } else {
        canvas.drawText(num, cx - fs * 0.45f, centered(numPaint, cy), numPaint)
        canvas.drawText(arrow, cx + fs * 0.45f, centered(arrowPaint, cy), arrowPaint)
    }
}

/**
 * Tracks one loop-drawing stroke. Cells are (row, col). Each step between adjacent cells
 * toggles their shared segment; the first step fixes draw vs erase. A blocked draw (see
 * [YajilinEngine.canDrawEdge]) leaves the anchor in place so a later legal move from the
 * same cell still works.
 *
 * Writes made during the stroke are layered over the incoming values via [pending]: the
 * board's userValues only catch up after a recomposition, and pointer events can arrive
 * faster than that, so without the overlay the degree check and draw/erase decision would
 * read stale state.
 */
private class YajilinDragState(
    private val cells: List<List<YajilinEngine.Clue?>>,
    private val rows: Int,
    private val cols: Int,
) {
    private var last: Pair<Int, Int>? = null
    // null = undecided, true = erasing, false = drawing.
    private var erasing: Boolean? = null
    private val pending = mutableMapOf<String, Int>()

    fun start(cell: Pair<Int, Int>?) {
        last = cell
        erasing = null
        pending.clear()
    }

    fun end() {
        last = null
        erasing = null
        pending.clear()
    }

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, apply: (Map<String, Int>) -> Unit) {
        if (cell == null) return
        val from = last ?: run { last = cell; return }
        if (cell == from) return
        val dr = cell.first - from.first
        val dc = cell.second - from.second
        if (dr != 0 && dc != 0) {
            // Cut across a corner: the route is ambiguous, so re-anchor without drawing.
            last = cell
            return
        }
        // A fast straight drag can skip cells between pointer events; walk each one.
        val sr = Integer.signum(dr)
        val sc = Integer.signum(dc)
        var cur = from
        while (cur != cell) {
            val next = (cur.first + sr) to (cur.second + sc)
            if (!step(cur, next, values, apply)) return // blocked: anchor stays at cur
            cur = next
            last = cur
        }
    }

    /** Apply one adjacent step; false when a draw is refused. */
    private fun step(
        from: Pair<Int, Int>,
        to: Pair<Int, Int>,
        values: Map<String, Int>,
        apply: (Map<String, Int>) -> Unit,
    ): Boolean {
        val key = when {
            to.second == from.second + 1 -> YajilinEngine.hKey(from.first, from.second)
            to.second == from.second - 1 -> YajilinEngine.hKey(from.first, to.second)
            to.first == from.first + 1 -> YajilinEngine.vKey(from.first, from.second)
            else -> YajilinEngine.vKey(to.first, from.second)
        }
        val current = if (pending.isEmpty()) values else values + pending
        val drawn = current[key] == 1
        if (erasing == null) erasing = drawn

        if (erasing == true) {
            if (drawn) write(mapOf(key to 0), apply)
            return true
        }
        if (drawn) return true

        val g = YajilinEngine.grids(rows, cols, current)
        if (!YajilinEngine.canDrawEdge(cells, g, from.first, from.second) ||
            !YajilinEngine.canDrawEdge(cells, g, to.first, to.second)
        ) {
            return false
        }
        // The loop passes through both cells, so neither can stay marked "not black".
        val changes = mutableMapOf(key to 1)
        for ((r, c) in listOf(from, to)) {
            val bKey = YajilinEngine.cellKey(c, r)
            if (current[bKey] == ShadeCycle.MARKED) changes[bKey] = 0
        }
        write(changes, apply)
        return true
    }

    private fun write(changes: Map<String, Int>, apply: (Map<String, Int>) -> Unit) {
        pending.putAll(changes)
        apply(changes)
    }
}
