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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.PictoLinkEngine

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFCCCCCC)
// A linked pair and its path fill black; a wrong link is red under live validation.
private val LINKED_FILL = Color.Black
private val ERROR_FILL = Color(0xFFDD3333)
// A path still being drawn is a plain dark line; over a filled link the route stays
// faintly visible so it can be found to erase.
private val OPEN_PATH = Color(0xFF222222)
private val LINKED_PATH = Color(0xFF555555)
private val SELECT_FILL = Color(0xFFE0E8FF)
private val CLUE_TEXT = Color(0xFF222222)
private val CLUE_TEXT_FILLED = Color.White

/**
 * Compose Canvas renderer for Picto Link (puzzle type 27), the analog of
 * frontend/src/components/PictoLinkBoard.tsx.
 *
 * A one-finger drag between adjacent cells toggles the shared segment, like Number Link:
 * the stroke's first segment fixes draw-vs-erase, and drawing is degree-capped (empty
 * cells 2, clue endpoints 1, 1-clues 0) so paths can't cross, branch, or touch a 1. A tap
 * on a 1-clue toggles it as a filled single; a tap on a path cell that isn't a clue clears
 * the segments touching it, for quick correction. Every change goes out through
 * [onApplyChanges] (a 0 value drops the key). Two fingers pan/zoom via [ZoomableBoard].
 *
 * Once a path joins two clues, it and its endpoints fill black (a filled single too), so
 * the picture emerges; with [liveValidate] on, a link whose partner or length is wrong
 * fills red instead (see [PictoLinkEngine.linkStates]). A path still being drawn is a dark
 * line. Clue numbers are bare (no token), white on a filled cell. Above the board sits a
 * small live preview of the picture — the same cells the collection thumbnail shows once
 * solved.
 *
 * The Admin review editor passes [onSelectCell]: taps then select a cell (highlighted via
 * [selectedCell], "col,row") and drags draw nothing; the preview is left out there.
 */
@Composable
fun PictoLinkBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    selectedCell: String? = null,
    onSelectCell: ((col: Int, row: Int) -> Unit)? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val cells = remember(puzzle.id, puzzle.canonRepr) { PictoLinkEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The gesture closures outlive recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callbacks through state.
    val valuesState = rememberUpdatedState(userValues)
    val cellsState = rememberUpdatedState(cells)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onSelect = rememberUpdatedState(onSelectCell)
    val selectedState = rememberUpdatedState(selectedCell)

    val drag = remember(puzzle.id, rows, cols) { PictoLinkDragState(rows, cols) }
    val drawEnabled = onSelectCell == null

    // One trace per input change, shared by the preview and the board fills.
    val edges = remember(cells, userValues) { PictoLinkEngine.edges(cells, userValues) }
    val links = remember(cells, userValues) {
        PictoLinkEngine.linkStates(cells, edges, PictoLinkEngine.singles(cells, userValues))
    }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (drawEnabled) {
            val picture = remember(links) {
                IntArray(links.size) {
                    if (links[it] == PictoLinkEngine.UNLINKED) PictoLinkEngine.GROUND_ARGB else PictoLinkEngine.FILL_ARGB
                }
            }
            PicturePreview(picture, rows, cols, PictoLinkEngine.GROUND_ARGB)
        }

        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            onTapCell = { col, row ->
                val select = onSelect.value
                if (select != null) {
                    select(col, row)
                } else {
                    PictoLinkEngine.tapChanges(cellsState.value, valuesState.value, row, col)?.let { onApply.value(it) }
                }
            },
            // ZoomableBoard reports cells as (col, row); the drag state works in (row, col) to
            // match the "h:row,col"/"v:row,col" segment keys, so swap at the boundary.
            onDrawStart = if (drawEnabled) {
                { cell -> drag.start(cell?.let { (c, r) -> r to c }) }
            } else {
                null
            },
            onDrawTo = if (drawEnabled) {
                { cell ->
                    drag.moveTo(cell?.let { (c, r) -> r to c }, cellsState.value, valuesState.value) {
                        onApply.value(it)
                    }
                }
            } else {
                null
            },
            onDrawEnd = if (drawEnabled) {
                { drag.end() }
            } else {
                null
            },
        ) { cell ->
            val boardW = cols * cell
            val boardH = rows * cell
            drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
            fun linked(r: Int, c: Int) = links[r * cols + c] != PictoLinkEngine.UNLINKED

            selectedState.value?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
                drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
            }

            val gridW = 1.dp.toPx()
            for (r in 1 until rows) {
                drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), gridW)
            }
            for (c in 1 until cols) {
                drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), gridW)
            }

            // Link fills over the grid lines, so a finished picture reads as solid.
            for (r in 0 until rows) {
                for (c in 0 until cols) {
                    val fill = when (links[r * cols + c]) {
                        PictoLinkEngine.UNLINKED -> continue
                        PictoLinkEngine.BAD_LINK -> if (liveValidate) ERROR_FILL else LINKED_FILL
                        else -> LINKED_FILL
                    }
                    drawRect(fill, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
                }
            }

            // Path segments between cell centers (under the clues).
            val pathW = cell * 0.14f
            for (r in 0 until rows) {
                for (c in 0 until cols - 1) {
                    if (edges.h[r][c] == PictoLinkEngine.SEGMENT) {
                        drawLine(
                            if (linked(r, c) && linked(r, c + 1)) LINKED_PATH else OPEN_PATH,
                            Offset((c + 0.5f) * cell, (r + 0.5f) * cell),
                            Offset((c + 1.5f) * cell, (r + 0.5f) * cell),
                            pathW,
                            cap = StrokeCap.Round,
                        )
                    }
                }
            }
            for (r in 0 until rows - 1) {
                for (c in 0 until cols) {
                    if (edges.v[r][c] == PictoLinkEngine.SEGMENT) {
                        drawLine(
                            if (linked(r, c) && linked(r + 1, c)) LINKED_PATH else OPEN_PATH,
                            Offset((c + 0.5f) * cell, (r + 0.5f) * cell),
                            Offset((c + 0.5f) * cell, (r + 1.5f) * cell),
                            pathW,
                            cap = StrokeCap.Round,
                        )
                    }
                }
            }

            val borderW = 2.dp.toPx()
            drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(borderW))

            // Clue numbers on top of paths: bare, white on a filled cell.
            for (r in 0 until rows) {
                for (c in 0 until cells[r].size) {
                    val v = cells[r][c]
                    if (v <= 0) continue
                    drawClue(v, (c + 0.5f) * cell, (r + 0.5f) * cell, cell, if (linked(r, c)) CLUE_TEXT_FILLED else CLUE_TEXT)
                }
            }
        }
    }
}

/** Draw a (possibly multi-digit) clue centered at (cx, cy). */
private fun DrawScope.drawClue(value: Int, cx: Float, cy: Float, cell: Float, color: Color) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = cell * (if (value >= 10) 0.42f else 0.5f)
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy - (fm.ascent + fm.descent) / 2, paint)
}

/**
 * Tracks one draw/erase stroke (port of PictoLinkBoard.tsx pointer handlers); cells are
 * (row, col). Each step toggles the segment between the last cell and the newly entered
 * adjacent one. The first toggled segment fixes the mode: already drawn -> the stroke
 * erases, else it draws. Draw steps respect [PictoLinkEngine.maxDegree]; a blocked draw
 * leaves the anchor in place so a later legal move from the same cell can proceed.
 *
 * Writes made during the stroke are kept in [pending] and layered over the incoming
 * values: userValues only catch up after a recomposition, and pointer events can arrive
 * faster than that.
 */
private class PictoLinkDragState(private val rows: Int, private val cols: Int) {
    private var last: Pair<Int, Int>? = null
    // null = undecided, true = erasing, false = drawing.
    private var erasing: Boolean? = null
    private val pending = mutableMapOf<String, Int>()

    fun start(cell: Pair<Int, Int>?) {
        last = cell
        erasing = null
        pending.clear()
    }

    fun moveTo(
        cell: Pair<Int, Int>?,
        cells: List<List<Int>>,
        values: Map<String, Int>,
        apply: (Map<String, Int>) -> Unit,
    ) {
        if (cell == null) return
        val from = last ?: run { last = cell; return }
        if (cell == from) return
        val dr = cell.first - from.first
        val dc = cell.second - from.second
        if (dr != 0 && dc != 0) {
            // Diagonal jump (finger cut across a corner): ambiguous, so re-anchor.
            last = cell
            return
        }
        // A fast drag can skip cells between pointer events; walk each step so the path
        // has no gaps.
        val sr = Integer.signum(dr)
        val sc = Integer.signum(dc)
        var cur = from
        while (cur != cell) {
            val next = (cur.first + sr) to (cur.second + sc)
            if (!step(cur, next, cells, values, apply)) return // blocked: anchor stays at cur
            cur = next
            last = cur
        }
    }

    /** Apply one adjacent step; false when a draw is blocked by the degree cap. */
    private fun step(
        from: Pair<Int, Int>,
        to: Pair<Int, Int>,
        cells: List<List<Int>>,
        values: Map<String, Int>,
        apply: (Map<String, Int>) -> Unit,
    ): Boolean {
        val dr = to.first - from.first
        val dc = to.second - from.second
        val key = when {
            dc == 1 -> PictoLinkEngine.hKey(from.first, from.second)
            dc == -1 -> PictoLinkEngine.hKey(from.first, to.second)
            dr == 1 -> PictoLinkEngine.vKey(from.first, from.second)
            else -> PictoLinkEngine.vKey(to.first, from.second)
        }
        val current = if (pending.isEmpty()) values else values + pending
        val edgeVal = current[key] ?: PictoLinkEngine.EMPTY

        if (erasing == null) erasing = edgeVal == PictoLinkEngine.SEGMENT

        if (erasing == true) {
            if (edgeVal == PictoLinkEngine.SEGMENT) write(key, PictoLinkEngine.EMPTY, apply)
            return true
        }

        if (edgeVal == PictoLinkEngine.EMPTY) {
            val e = PictoLinkEngine.edges(cells, current)
            val maxFrom = PictoLinkEngine.maxDegree(cells.getOrNull(from.first)?.getOrNull(from.second) ?: 0)
            val maxTo = PictoLinkEngine.maxDegree(cells.getOrNull(to.first)?.getOrNull(to.second) ?: 0)
            if (PictoLinkEngine.degreeOf(e, from.first, from.second, rows, cols) >= maxFrom ||
                PictoLinkEngine.degreeOf(e, to.first, to.second, rows, cols) >= maxTo
            ) {
                return false
            }
            write(key, PictoLinkEngine.SEGMENT, apply)
        }
        return true
    }

    private fun write(key: String, state: Int, apply: (Map<String, Int>) -> Unit) {
        pending[key] = state
        apply(mapOf(key to state))
    }

    fun end() {
        last = null
        erasing = null
        pending.clear()
    }
}
