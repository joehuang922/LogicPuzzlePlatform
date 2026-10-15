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
    val drag = remember(puzzle.id) {
        LoopStroke { from, to, key, current ->
            val g = YajilinEngine.grids(rows, cols, current)
            if (!YajilinEngine.canDrawEdge(cells, g, from.first, from.second) ||
                !YajilinEngine.canDrawEdge(cells, g, to.first, to.second)
            ) {
                return@LoopStroke null
            }
            // The loop passes through both cells, so neither can stay marked "not black".
            buildMap {
                put(key, 1)
                for ((r, c) in listOf(from, to)) {
                    val bKey = YajilinEngine.cellKey(c, r)
                    if (current[bKey] == ShadeCycle.MARKED) put(bKey, 0)
                }
            }
        }
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
        // ZoomableBoard reports (col, row); the stroke works in (row, col) to match the
        // row-first "h:r,c"/"v:r,c"/"b:r,c" keys, so swap at the boundary.
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
