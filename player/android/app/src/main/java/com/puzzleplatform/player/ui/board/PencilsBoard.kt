package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.PencilsEngine
import com.puzzleplatform.player.puzzle.PencilsRules
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFCCCCCC)
private val TRAIL = Color(0xFF999999)
private val CLUE = Color(0xFF222222)
private val GIVEN_HEAD = Color(0xFF222222)
private val PLAYER_HEAD = Color(0xFF4A7CB5)
private val PENDING_FILL = Color(0x264A7CB5)

/** A tap this close to an interior grid line (in cells) toggles that edge, as on the web. */
private const val EDGE_ZONE = 0.22f

/**
 * Compose Canvas renderer for Pencils (puzzle type 8), the analog of
 * frontend/src/components/PencilsBoard.tsx. One finger, three inputs, as on the web:
 *  - drag between neighbouring cell centres draws a grey trail (Masyu's [MasyuDragState]
 *    on the "th:"/"tv:" keys; the first segment crossed decides draw or erase);
 *  - a tap near an interior grid line toggles a body edge, except an edge a head implies;
 *  - a tap on an empty cell opens a direction picker under the board to place a head
 *    (which also draws its base edge); a tap on a placed head removes it and its edge.
 * Two fingers pan/zoom via [ZoomableBoard]. Every change goes to [onApplyChanges] as
 * key -> value (0 removes).
 *
 * The Admin review editor passes [readOnly], [onTapCell] to select a cell and
 * [selectedCell] ("col,row") to outline it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PencilsBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    onTapCell: (col: Int, row: Int) -> Unit = { _, _ -> },
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { PencilsEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onTap = rememberUpdatedState(onTapCell)
    val readOnlyState = rememberUpdatedState(readOnly)
    val drag = remember(puzzle.id) { MasyuDragState(PencilsRules::trailHKey, PencilsRules::trailVKey) }
    // (row, col) of the cell waiting for a head direction.
    var pending by remember(puzzle.id) { mutableStateOf<Pair<Int, Int>?>(null) }

    fun canonAt(r: Int, c: Int) = cells.getOrNull(r)?.getOrNull(c) ?: 0

    // Edges a given head implies: always drawn, never toggled.
    val canonEdges = remember(cells) {
        buildSet {
            for (r in 0 until rows) for (c in 0 until cols) {
                PencilsRules.headEdgeKey(r, c, canonAt(r, c), rows, cols)?.let(::add)
            }
        }
    }

    fun isLocked(key: String, values: Map<String, Int>): Boolean {
        if (key in canonEdges) return true
        for ((k, v) in values) {
            if (!k.startsWith("hd:")) continue
            val rc = k.removePrefix("hd:").split(",").map { it.toIntOrNull() ?: -1 }
            if (rc.size == 2 && PencilsRules.headEdgeKey(rc[0], rc[1], v, rows, cols) == key) return true
        }
        return false
    }

    fun tap(fx: Float, fy: Float) {
        val values = valuesState.value
        // Edge first: horizontal lines, then vertical, like the web board.
        val hLine = fy.roundToInt()
        val vLine = fx.roundToInt()
        val edgeKey = when {
            hLine in 1 until rows && abs(fy - hLine) < EDGE_ZONE && fx >= 0 && fx < cols ->
                PencilsRules.edgeHKey(hLine - 1, floor(fx).toInt())
            vLine in 1 until cols && abs(fx - vLine) < EDGE_ZONE && fy >= 0 && fy < rows ->
                PencilsRules.edgeVKey(floor(fy).toInt(), vLine - 1)
            else -> null
        }
        if (edgeKey != null) {
            pending = null
            if (!isLocked(edgeKey, values)) onApply.value(mapOf(edgeKey to if (values[edgeKey] == 1) 0 else 1))
            return
        }
        val r = floor(fy).toInt()
        val c = floor(fx).toInt()
        if (r !in 0 until rows || c !in 0 until cols) return
        if (canonAt(r, c) != 0) return
        val head = values[PencilsRules.headKey(r, c)] ?: 0
        if (head != 0) {
            val changes = mutableMapOf(PencilsRules.headKey(r, c) to 0)
            PencilsRules.headEdgeKey(r, c, head, rows, cols)?.let { changes[it] = 0 }
            onApply.value(changes)
            pending = null
        } else {
            pending = if (pending == (r to c)) null else r to c
        }
    }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            onTapCell = { col, row -> onTap.value(col, row) },
            onTapPrecise = { fx, fy -> if (!readOnlyState.value) tap(fx, fy) },
            onDrawStart = { cell -> if (!readOnlyState.value) drag.start(cell) },
            onDrawEnd = { drag.end() },
            onDrawTo = { cell ->
                if (!readOnlyState.value) {
                    drag.moveTo(cell, valuesState.value) { key, on -> onApply.value(mapOf(key to if (on) 1 else 0)) }
                }
            },
        ) { cell ->
            val boardW = cols * cell
            val boardH = rows * cell
            val values = valuesState.value
            drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
            pending?.let { (r, c) ->
                drawRect(PENDING_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
            }

            val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.11f, cell * 0.08f))
            for (r in 1 until rows) drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), cell * 0.02f, pathEffect = dash)
            for (c in 1 until cols) drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), cell * 0.02f, pathEffect = dash)

            // Body edges: drawn by the player (incl. placed heads' bases) or implied by given heads.
            val edgeW = cell * 0.07f
            for (r in 0 until rows - 1) for (c in 0 until cols) {
                val key = PencilsRules.edgeHKey(r, c)
                if (values[key] != 1 && key !in canonEdges) continue
                drawLine(BORDER, Offset(c * cell, (r + 1) * cell), Offset((c + 1) * cell, (r + 1) * cell), edgeW, cap = StrokeCap.Square)
            }
            for (r in 0 until rows) for (c in 0 until cols - 1) {
                val key = PencilsRules.edgeVKey(r, c)
                if (values[key] != 1 && key !in canonEdges) continue
                drawLine(BORDER, Offset((c + 1) * cell, r * cell), Offset((c + 1) * cell, (r + 1) * cell), edgeW, cap = StrokeCap.Square)
            }

            // Trails, grey so they read apart from the body edges.
            val trailW = cell * 0.09f
            for (r in 0 until rows) for (c in 0 until cols - 1) {
                if (values[PencilsRules.trailHKey(r, c)] != 1) continue
                val y = (r + 0.5f) * cell
                drawLine(TRAIL, Offset((c + 0.5f) * cell, y), Offset((c + 1.5f) * cell, y), trailW, cap = StrokeCap.Round)
            }
            for (r in 0 until rows - 1) for (c in 0 until cols) {
                if (values[PencilsRules.trailVKey(r, c)] != 1) continue
                val x = (c + 0.5f) * cell
                drawLine(TRAIL, Offset(x, (r + 0.5f) * cell), Offset(x, (r + 1.5f) * cell), trailW, cap = StrokeCap.Round)
            }

            // Clues and heads.
            for (r in 0 until rows) for (c in 0 until cols) {
                val center = Offset((c + 0.5f) * cell, (r + 0.5f) * cell)
                val v = canonAt(r, c)
                when {
                    v > 0 -> drawPencilsNumber(v, center, cell)
                    v < 0 -> drawPencilHead(v, center, cell, GIVEN_HEAD)
                    else -> {
                        val head = values[PencilsRules.headKey(r, c)] ?: 0
                        if (PencilsRules.isHead(head)) drawPencilHead(head, center, cell, PLAYER_HEAD)
                    }
                }
            }

            drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = cell * 0.07f))
            drawCellSelection(selectedCell, cell)
        }

        val p = pending
        if (!readOnly && p != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((dir, name) in PencilsRules.HEADS) {
                    FilterChip(
                        selected = false,
                        onClick = {
                            val (r, c) = p
                            val changes = mutableMapOf(PencilsRules.headKey(r, c) to dir)
                            PencilsRules.headEdgeKey(r, c, dir, rows, cols)?.let { changes[it] = 1 }
                            onApplyChanges(changes)
                            pending = null
                        },
                        label = { Text(name) },
                        leadingIcon = {
                            Canvas(Modifier.size(18.dp)) { drawPencilHead(dir, center, size.minDimension, PLAYER_HEAD) }
                        },
                    )
                }
                TextButton(onClick = { pending = null }) { Text("Cancel") }
            }
        }
    }
}

/**
 * A pencil head for [dir] (-1 up, -2 down, -3 left, -4 right) in a cell of side [size]
 * centred at [center]: a white triangle whose flat base lies on the cell's edge behind it
 * and whose tip is the centre, with a filled lead; matches PencilHead in PencilsBoard.tsx.
 * Shared by the board, the mini board and the pickers.
 */
fun DrawScope.drawPencilHead(dir: Int, center: Offset, size: Float, tip: Color = GIVEN_HEAD) {
    val angle = when (dir) {
        PencilsRules.UP -> 180f
        PencilsRules.DOWN -> 0f
        PencilsRules.LEFT -> 90f
        PencilsRules.RIGHT -> -90f
        else -> return
    }
    val x0 = center.x - size / 2
    val y0 = center.y - size / 2
    val outer = Path().apply {
        moveTo(x0, y0)
        lineTo(x0 + size, y0)
        lineTo(x0 + size * 0.5f, y0 + size * 0.5f)
        close()
    }
    val lead = Path().apply {
        moveTo(x0 + size * 0.3f, y0 + size * 0.3f)
        lineTo(x0 + size * 0.7f, y0 + size * 0.3f)
        lineTo(x0 + size * 0.5f, y0 + size * 0.5f)
        close()
    }
    rotate(angle, pivot = center) {
        drawPath(outer, Color.White)
        drawPath(outer, tip, style = Stroke(width = size * 0.05f))
        drawPath(lead, tip)
    }
}

/** A bold number clue centred at [center] in a cell of side [cell]. */
internal fun DrawScope.drawPencilsNumber(value: Int, center: Offset, cell: Float) {
    val text = value.toString()
    val paint = android.graphics.Paint().apply {
        color = CLUE.toArgb()
        textSize = cell * if (text.length > 1) 0.42f else 0.5f
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, center.x, center.y - (fm.ascent + fm.descent) / 2, paint)
}
