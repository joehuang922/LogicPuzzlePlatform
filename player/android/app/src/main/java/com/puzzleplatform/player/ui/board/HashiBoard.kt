package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HashiEngine
import com.puzzleplatform.player.puzzle.HashiRules

private val GRID_BG = Color.White
private val INK = Color(0xFF222222)
private val DONE_FILL = Color(0xFFD0D0D0)
private val ERROR_COLOR = Color(0xFFDD3333)
private val ERROR_FILL = Color(0xFFF8D0D0)
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for Hashi (puzzle type 34), the analog of
 * frontend/src/components/HashiBoard.tsx. Each lattice point is drawn at a cell centre,
 * with no grid lines.
 *
 * Input is drag only ([HashiDragState]): press on an island and drag along its row or
 * column; reaching the nearest island that way cycles the bridge between them
 * 0 -> 1 -> 2 -> 0 (one atomic [onApplyChanges]) and ends the gesture. A new bridge that
 * would cross another does nothing. Two fingers pan/zoom via [ZoomableBoard]. Islands
 * turn grey once their number is met and, with [liveValidate], red when over it.
 *
 * The Admin review editor passes [onTapCell] to select a point and [selectedCell]
 * ("col,row") to highlight it, plus [showEmptyPoints] to dot the empty lattice points.
 */
@Composable
fun HashiBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    onTapCell: (col: Int, row: Int) -> Unit = { _, _ -> },
    selectedCell: String? = null,
    showEmptyPoints: Boolean = false,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { HashiEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)
    val drag = remember(puzzle.id, puzzle.canonRepr) { HashiDragState(cells) }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) }, // play has no tap; the Admin editor selects
        onDrawStart = { cell -> drag.start(cell) },
        onDrawEnd = { drag.end() },
        onDrawTo = { cell -> drag.moveTo(cell, valuesState.value) { onApply.value(it) } },
    ) { cell ->
        val values = valuesState.value
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(cols * cell, rows * cell))
        selectedState.value?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }
        val bridges = HashiRules.bridges(rows, cols, values)
        fun centre(p: HashiRules.Point) = Offset((p.c + 0.5f) * cell, (p.r + 0.5f) * cell)

        // Bridges under the islands: walk right and down from each island to its neighbour.
        val gap = cell * 0.09f
        for (r in 0 until rows) for (c in 0 until cols) {
            if (!HashiRules.isIsland(cells[r].getOrNull(c) ?: 0)) continue
            val a = HashiRules.Point(r, c)
            for ((dr, dc) in listOf(0 to 1, 1 to 0)) {
                val b = HashiRules.neighbour(cells, a, dr, dc) ?: continue
                val n = HashiRules.bridgeCount(bridges, a, b)
                if (n == 0) continue
                val offsets = if (n == 1) listOf(0f) else listOf(-gap, gap)
                for (o in offsets) {
                    val shift = if (dr == 0) Offset(0f, o) else Offset(o, 0f)
                    drawLine(INK, centre(a) + shift, centre(b) + shift, cell * 0.05f)
                }
            }
        }

        for (r in 0 until rows) for (c in 0 until cols) {
            val v = cells[r].getOrNull(c) ?: 0
            val at = centre(HashiRules.Point(r, c))
            if (!HashiRules.isIsland(v)) {
                if (showEmptyPoints) drawCircle(Color(0xFFBBBBBB), cell * 0.05f, at)
                continue
            }
            val state = HashiRules.islandState(cells, bridges, r, c)
            val error = liveValidate && state == HashiRules.IslandState.OVER
            val fill = when {
                error -> ERROR_FILL
                state == HashiRules.IslandState.DONE -> DONE_FILL
                else -> Color.White
            }
            drawHashiIsland(v, at, cell, fill, if (error) ERROR_COLOR else INK)
        }
    }
}

/** A circled island number [value] centred at [center] in a cell of side [cell]. */
internal fun DrawScope.drawHashiIsland(value: Int, center: Offset, cell: Float, fill: Color = Color.White, ink: Color = INK) {
    val radius = cell * 0.42f
    drawCircle(fill, radius, center)
    drawCircle(ink, radius, center, style = Stroke(width = cell * 0.045f))
    drawCenteredNumber(value, center, cell, if (ink == INK) Color.Black else ink)
}

/**
 * One drag gesture: the island it started on, until the finger reaches an island along
 * its row or column. That cycles the bridge to the nearest island that way and ends the
 * gesture (so dragging back doesn't cycle again). Cells are ZoomableBoard's (col, row).
 */
internal class HashiDragState(private val cells: List<List<Int>>) {
    private var from: HashiRules.Point? = null

    fun start(cell: Pair<Int, Int>?) {
        from = cell?.let { (c, r) -> HashiRules.Point(r, c) }
            ?.takeIf { HashiRules.isIsland(cells.getOrNull(it.r)?.getOrNull(it.c) ?: 0) }
    }

    fun end() {
        from = null
    }

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, apply: (Map<String, Int>) -> Unit) {
        val a = from ?: return
        val (c, r) = cell ?: return
        val to = HashiRules.Point(r, c)
        if (to == a || !HashiRules.isIsland(cells.getOrNull(r)?.getOrNull(c) ?: 0)) return
        if (to.r != a.r && to.c != a.c) return
        // A fast swipe can skip the neighbour's cell and land on an island beyond it; the
        // bridge still goes to the nearest island that way.
        val next = HashiRules.neighbour(cells, a, Integer.signum(to.r - a.r), Integer.signum(to.c - a.c)) ?: return
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        from = null
        val changes = HashiRules.cycleBridge(cells, HashiRules.bridges(rows, cols, values), a, next)
        if (changes.isNotEmpty()) apply(changes)
    }
}
