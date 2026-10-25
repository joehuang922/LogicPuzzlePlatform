package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.SlalomEngine

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFDDDDDD)
// Slalom has no rooms, so the near-black web wall fill doesn't hide any borders here.
private val WALL = Color(0xFF333333)
private val GATE = Color(0xFF666666)
private val TRAIL = Color(0xFF2196F3)
private val START = Color(0xFF222222)
private val SELECT = Color(0xFF1976D2)

/**
 * Compose Canvas renderer for Slalom (puzzle type 10), the analog of
 * frontend/src/components/SlalomBoard.tsx.
 *
 * Input is drag only: a one-finger drag draws the trail between cell centers via the
 * shared [LoopStroke] (the first segment crossed fixes draw vs erase). A segment is refused
 * into a wall, onto a cell that already has two segments, or along a gate (see
 * [SlalomEngine.canDraw]). Two fingers pan/zoom via [ZoomableBoard].
 *
 * Walls are dark squares; gates are dashed lines through cell centers, with a numbered
 * gate's order shown (number + arrow toward the gate) in the wall cells capping it; the
 * start cell shows the circled gate count.
 *
 * The Admin review editor passes [onTapCell] to select a cell and [selectedCell]
 * ("col,row") to highlight it.
 */
@Composable
fun SlalomBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    onTapCell: (col: Int, row: Int) -> Unit = { _, _ -> },
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val canon = remember(puzzle.id, puzzle.canonRepr) { SlalomEngine.parse(puzzle) }
    val rows = canon.rows
    val cols = canon.cols
    if (rows == 0 || cols == 0) return

    // ZoomableBoard's gesture closures outlive recomposition, so read the freshest
    // values and callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)
    val drag = remember(puzzle.id, canon) {
        LoopStroke { from, to, key, current ->
            val t = SlalomEngine.trail(rows, cols, current)
            if (SlalomEngine.canDraw(canon, t, from, to)) mapOf(key to 1) else null
        }
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) }, // a tap draws nothing; the Admin editor selects
        // ZoomableBoard reports (col, row); the stroke works in (row, col) to match the
        // row-first "h:r,c"/"v:r,c" keys, so swap at the boundary.
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

        for (r in 0 until rows) for (c in 0 until cols) {
            if (canon.isWall(r, c)) drawRect(WALL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        // Gates: dashed lines through cell centers spanning their cells.
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.11f, cell * 0.08f))
        val gateW = cell * 0.055f
        for (gate in canon.gates) {
            if (gate.vertical) {
                val x = (gate.line + 0.5f) * cell
                drawLine(GATE, Offset(x, gate.from * cell), Offset(x, (gate.to + 1) * cell), gateW, pathEffect = dash)
            } else {
                val y = (gate.line + 0.5f) * cell
                drawLine(GATE, Offset(gate.from * cell, y), Offset((gate.to + 1) * cell, y), gateW, pathEffect = dash)
            }
        }

        // Gate order numbers in the wall cells capping each numbered gate.
        for (gate in canon.gates) {
            val n = gate.number ?: continue
            if (gate.vertical) {
                if (canon.isWall(gate.from - 1, gate.line)) drawGateLabel(n, "↓", gate.from - 1, gate.line, false, cell)
                if (canon.isWall(gate.to + 1, gate.line)) drawGateLabel(n, "↑", gate.to + 1, gate.line, false, cell)
            } else {
                if (canon.isWall(gate.line, gate.from - 1)) drawGateLabel(n, "→", gate.line, gate.from - 1, true, cell)
                if (canon.isWall(gate.line, gate.to + 1)) drawGateLabel(n, "←", gate.line, gate.to + 1, true, cell)
            }
        }

        // Start cell: circled gate count.
        val sx = (canon.startCol + 0.5f) * cell
        val sy = (canon.startRow + 0.5f) * cell
        drawCircle(GRID_BG, cell * 0.35f, Offset(sx, sy))
        drawCircle(START, cell * 0.35f, Offset(sx, sy), style = Stroke(width = cell * 0.055f))
        drawCenteredText(canon.gateCount.toString(), sx, sy, cell * 0.4f, START, bold = true)

        // Trail on top.
        val trailW = cell * 0.09f
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            if (values[SlalomEngine.hKey(r, c)] != 1) continue
            val y = (r + 0.5f) * cell
            drawLine(TRAIL, Offset((c + 0.5f) * cell, y), Offset((c + 1.5f) * cell, y), trailW, cap = StrokeCap.Round)
        }
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            if (values[SlalomEngine.vKey(r, c)] != 1) continue
            val x = (c + 0.5f) * cell
            drawLine(TRAIL, Offset(x, (r + 0.5f) * cell), Offset(x, (r + 1.5f) * cell), trailW, cap = StrokeCap.Round)
        }

        // Outlined on top rather than filled, so a selected wall cell still shows it.
        selectedState.value?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
            val w = cell * 0.08f
            drawRect(SELECT, topLeft = Offset(c * cell + w / 2, r * cell + w / 2), size = Size(cell - w, cell - w), style = Stroke(width = w))
        }

        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = 2.dp.toPx()))
    }
}

/**
 * A gate's order number in wall cell (r, c), white on the wall, laid out like the web board:
 * for a horizontal gate the arrow sits above the number; for a vertical gate, right of it.
 */
private fun DrawScope.drawGateLabel(n: Int, arrow: String, r: Int, c: Int, stacked: Boolean, cell: Float) {
    val fs = cell * 0.34f
    val cx = (c + 0.5f) * cell
    val cy = (r + 0.5f) * cell
    if (stacked) {
        drawCenteredText(arrow, cx, cy - fs * 0.45f, fs, Color.White, bold = false)
        drawCenteredText(n.toString(), cx, cy + fs * 0.55f, fs, Color.White, bold = true)
    } else {
        drawCenteredText(n.toString(), cx - fs * 0.45f, cy, fs, Color.White, bold = true)
        drawCenteredText(arrow, cx + fs * 0.45f, cy, fs, Color.White, bold = false)
    }
}

private fun DrawScope.drawCenteredText(text: String, cx: Float, cy: Float, size: Float, color: Color, bold: Boolean) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = size
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        if (bold) typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
