package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.IrregularNonogramEngine

private val PAPER = Color.White
private val CLUE_BG = Color(0xFFF1F1F1)
private val CLUE_LINE = Color(0xFFCCCCCC)
private val THIN = Color(0xFFBBBBBB)
private val THICK = Color(0xFF222222)
private val CLUE_TEXT = Color(0xFF222222)
private val CLUE_DONE = Color(0xFFAAAAAA)
private val ERROR = Color(0xFFDD3333)
private val FILL = Color(0xFF111111)
private val CROSS = Color(0xFF999999)
private val SELECT = Color(0xFFDBE8FF)
private val PIN_EDGE = Color(0xFF888888)

/**
 * Deepest a pinned clue block gets (Nonogram's clue-band cap); also at most
 * [PIN_MAX_VIEW_FRACTION] of the viewport. A longer clue shrinks its numbers to fit, as
 * Nonogram's bands do, so a pinned block never buries much of the board.
 */
private val PIN_MAX_DEPTH = 176.dp
private const val PIN_MAX_VIEW_FRACTION = 0.4f

/**
 * Compose Canvas renderer for Irregular Nonogram (puzzle type 45), the analog of
 * frontend/src/components/IrregularNonogramBoard.tsx: the board's cells and each clue
 * block where the canon puts it, on one lattice ([IrregularNonogramEngine.layoutBounds]).
 *
 * Input is Nonogram's: [mode] picks fill or cross; a tap toggles one cell, a one-finger
 * drag paints the origin's new state over cells still in the origin's old state. Only
 * board cells take input; values are "col,row" -> 1 / 2 through [onSetCell]. A clue
 * greys out once its piece matches, and with [liveValidate] turns red when its marks can
 * no longer fit. The filled picture is previewed above.
 *
 * STICKY CLUES, Nonogram's frozen bands adapted to clues that sit beside each segment
 * rather than along one edge: while playing, a clue block whose place scrolls off its
 * side of the viewport (a "start" row clue off the left, an "end" column clue off the
 * bottom, ...) pins to that edge, still on its row / column, and rides there until its
 * segment leaves too (see [StickyClue]). A pinned block holds its numbers in at most
 * [PIN_MAX_DEPTH], shrinking them when the clue is long, and swallows taps and drags so
 * the cells it covers aren't painted blind.
 *
 * The Admin review editor passes [onEditTap] (lattice row, col, which may lie outside the
 * board): taps edit instead of play, drags do nothing, the preview is left out, and
 * [selected] / [marks] highlight cells.
 */
@Composable
fun IrregularNonogramBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    mode: NonogramMode,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((row: Int, col: Int) -> Unit)? = null,
    selected: Set<Pair<Int, Int>> = emptySet(),
    marks: Map<Pair<Int, Int>, Color> = emptyMap(),
    showLattice: Boolean = false,
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { IrregularNonogramEngine.parseBoard(puzzle) }
    if (board.rows == 0 || board.cols == 0) return
    val base = remember(board) { IrregularNonogramEngine.layoutBounds(board) }
    // The editor's shape mode leaves a ring of lattice cells to grow the board into.
    val bounds = if (showLattice) intArrayOf(base[0] - 1, base[1] - 1, base[2] + 1, base[3] + 1) else base
    val minR = bounds[0]
    val minC = bounds[1]
    val latRows = bounds[2] - minR + 1
    val latCols = bounds[3] - minC + 1

    val valuesState = rememberUpdatedState(userValues)
    val modeState = rememberUpdatedState(mode)
    val onSet = rememberUpdatedState(onSetCell)
    val onEdit = rememberUpdatedState(onEditTap)
    val boardState = rememberUpdatedState(board)
    val drag = remember(puzzle.id) { PaintDrag() }
    val playing = onEditTap == null

    val status = remember(board, userValues) { IrregularNonogramEngine.clueStatus(board, userValues) }
    // A clue's text and frame: grey once its piece matches, red frame once it can't fit.
    fun clueColors(key: String) = ClueColors(
        text = if (key in status.first) CLUE_DONE else CLUE_TEXT,
        bad = liveValidate && key in status.second,
    )
    val segments = remember(board) { IrregularNonogramEngine.segments(board) }
    val clued = remember(board) { IrregularNonogramEngine.cluesBySegment(board) }
    val cluePlan = remember(board) {
        segments.mapNotNull { s -> clued[s.key]?.takeIf { it.clues.isNotEmpty() }?.let { s to it } }
    }
    // Pinned blocks from the last overlay draw, in viewport px: input under them is dropped.
    val pins = remember(puzzle.id) { PinnedRects() }
    val pinMaxPx = with(LocalDensity.current) { PIN_MAX_DEPTH.toPx() }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (playing) {
            val picture = remember(board, userValues) {
                IrregularNonogramEngine.pictureCells(board, userValues, IrregularNonogramEngine.GROUND_ARGB)
            }
            PicturePreview(picture, board.rows, board.cols, IrregularNonogramEngine.GROUND_ARGB)
        }
        ZoomableBoard(
            cols = latCols,
            rows = latRows,
            resetKey = puzzle.id,
            onTapCell = { col, row ->
                val r = row + minR
                val c = col + minC
                val edit = onEdit.value
                if (edit != null) {
                    edit(r, c)
                } else if (boardState.value.isBoard(r, c)) {
                    drag.tap(r, c, modeState.value, valuesState.value, onSet.value)
                }
            },
            onDrawStart = if (playing) {
                { cell ->
                    val rc = cell?.let { (c, r) -> (r + minR) to (c + minC) }?.takeIf { boardState.value.isBoard(it.first, it.second) }
                    drag.start(rc, modeState.value, valuesState.value, onSet.value)
                }
            } else {
                null
            },
            onDrawTo = if (playing) {
                { cell ->
                    val rc = cell?.let { (c, r) -> (r + minR) to (c + minC) }?.takeIf { boardState.value.isBoard(it.first, it.second) }
                    drag.moveTo(rc, valuesState.value, onSet.value)
                }
            } else {
                null
            },
            onDrawEnd = if (playing) {
                { drag.end() }
            } else {
                null
            },
            overlay = if (playing) {
                { cell, panX, panY ->
                    val cap = minOf(pinMaxPx, size.minDimension * PIN_MAX_VIEW_FRACTION)
                    val pinned = ArrayList<Rect>()
                    val later = ArrayList<() -> Unit>()
                    for ((s, clue) in cluePlan) {
                        val row = s.axis == "row"
                        val k = clue.clues.size
                        // Along the line: segment span and view span; across: the line's cell.
                        val origin = if (row) panX - minC * cell else panY - minR * cell
                        val segStart = origin + s.start * cell
                        val segEnd = segStart + s.length * cell
                        val across = if (row) panY + (s.line - minR) * cell else panX + (s.line - minC) * cell
                        val viewEnd = if (row) size.width else size.height
                        val slot = minOf(cell, cap / k)
                        val pin = StickyClue.pin(clue.side == "start", k * cell, k * slot, segStart, segEnd, 0f, viewEnd)
                        val color = clueColors(s.key)
                        if (pin == null) {
                            val at = if (clue.side == "start") segStart - k * cell else segEnd
                            drawClueBlock(row, at, across, cell, cell, clue.clues, color, pinned = false)
                        } else {
                            val rect = if (row) Rect(pin, across, pin + k * slot, across + cell) else Rect(across, pin, across + cell, pin + k * slot)
                            pinned += rect
                            // Pinned blocks go on top of every natural one.
                            later += { drawClueBlock(row, pin, across, slot, cell, clue.clues, color, pinned = true, startSide = clue.side == "start") }
                        }
                    }
                    later.forEach { it() }
                    pins.rects = pinned
                }
            } else {
                null
            },
            inputBlocked = if (playing) {
                { x, y -> pins.rects.any { it.contains(Offset(x, y)) } }
            } else {
                null
            },
        ) { cell ->
            fun x(c: Int) = (c - minC) * cell
            fun y(r: Int) = (r - minR) * cell
            if (showLattice) {
                for (r in 0 until latRows) for (c in 0 until latCols) {
                    drawRect(Color(0xFFEEEEEE), Offset(c * cell, r * cell), Size(cell, cell), style = Stroke(1f))
                }
            }
            // Clue blocks: here on the lattice when editing; the overlay draws them in play.
            if (!playing) {
                for (s in segments) {
                    val clue = clued[s.key] ?: continue
                    val color = clueColors(s.key)
                    for ((r, c, v) in IrregularNonogramEngine.clueLayout(clue, s.length)) {
                        drawClueCell(v, x(c), y(r), cell, cell, color)
                    }
                }
            }
            // Board cells, fills and crosses.
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                if (!board.cells[r][c]) continue
                val st = IrregularNonogramEngine.state(userValues, r, c)
                val bg = when {
                    st == IrregularNonogramEngine.FILLED -> FILL
                    (r to c) in selected -> SELECT
                    else -> PAPER
                }
                drawRect(bg, Offset(x(c), y(r)), Size(cell, cell))
                if (st == IrregularNonogramEngine.CROSSED) {
                    val m = cell * 0.28f
                    drawLine(CROSS, Offset(x(c) + m, y(r) + m), Offset(x(c) + cell - m, y(r) + cell - m), cell * 0.06f)
                    drawLine(CROSS, Offset(x(c) + cell - m, y(r) + m), Offset(x(c) + m, y(r) + cell - m), cell * 0.06f)
                }
            }
            // Lines: thin inside the board, thick every 5 lattice cells and around it.
            val thin = maxOf(1f, cell * 0.03f)
            val thick = maxOf(2f, cell * 0.08f)
            fun heavy(i: Int) = Math.floorMod(i, 5) == 0
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                if (!board.cells[r][c]) continue
                val top = !board.isBoard(r - 1, c) || heavy(r)
                val left = !board.isBoard(r, c - 1) || heavy(c)
                drawLine(if (top) THICK else THIN, Offset(x(c), y(r)), Offset(x(c + 1), y(r)), if (top) thick else thin)
                drawLine(if (left) THICK else THIN, Offset(x(c), y(r)), Offset(x(c), y(r + 1)), if (left) thick else thin)
                if (!board.isBoard(r + 1, c)) drawLine(THICK, Offset(x(c), y(r + 1)), Offset(x(c + 1), y(r + 1)), thick)
                if (!board.isBoard(r, c + 1)) drawLine(THICK, Offset(x(c + 1), y(r)), Offset(x(c + 1), y(r + 1)), thick)
            }
            for ((rc, color) in marks) {
                val (r, c) = rc
                val inset = cell * 0.12f
                drawRect(color, Offset(x(c) + inset, y(r) + inset), Size(cell - 2 * inset, cell - 2 * inset), style = Stroke(maxOf(1f, cell * 0.08f)))
            }
        }
    }
}

private data class ClueColors(val text: Color, val bad: Boolean)

/** Viewport rects of the pinned clue blocks, as last drawn. */
private class PinnedRects {
    var rects: List<Rect> = emptyList()
}

/**
 * Sticky placement of one clue block along its line, in px. The block's natural place is
 * [natural] deep beside the segment [segStart]..[segEnd] (before it for a [startSide]
 * clue, after it otherwise). While that place lies inside the view [viewStart]..[viewEnd]
 * the block isn't pinned: null. Once it crosses the view's edge, the block, now
 * [pinnedDepth] deep, holds that edge, like CSS position: sticky with the clue and its
 * segment as the container: it slides over the segment no further than the segment's far
 * end, then leaves with it (null once nothing of it is on screen). Returns the pinned
 * block's near edge (its left / top).
 */
internal object StickyClue {
    fun pin(
        startSide: Boolean,
        natural: Float,
        pinnedDepth: Float,
        segStart: Float,
        segEnd: Float,
        viewStart: Float,
        viewEnd: Float,
    ): Float? = if (startSide) {
        if (segStart - natural >= viewStart) {
            null
        } else {
            minOf(viewStart, segEnd - pinnedDepth).takeIf { it + pinnedDepth > viewStart }
        }
    } else {
        if (segEnd + natural <= viewEnd) {
            null
        } else {
            maxOf(viewEnd - pinnedDepth, segStart).takeIf { it < viewEnd }
        }
    }
}

/**
 * A clue's numbers in reading order from [along] (left / top edge) on the line whose cell
 * starts at [across], each in a [slot] x [cell] box. A [pinned] block gets a darker edge
 * on its board side so it reads as floating over the cells.
 */
private fun DrawScope.drawClueBlock(
    row: Boolean,
    along: Float,
    across: Float,
    slot: Float,
    cell: Float,
    nums: List<Int>,
    color: ClueColors,
    pinned: Boolean,
    startSide: Boolean = true,
) {
    nums.forEachIndexed { i, v ->
        val a = along + i * slot
        if (row) drawClueCell(v, a, across, slot, cell, color) else drawClueCell(v, across, a, cell, slot, color)
    }
    if (pinned && !color.bad) {
        val edge = if (startSide) along + nums.size * slot else along
        val w = maxOf(2f, cell * 0.06f)
        if (row) {
            drawLine(PIN_EDGE, Offset(edge, across), Offset(edge, across + cell), w)
        } else {
            drawLine(PIN_EDGE, Offset(across, edge), Offset(across + cell, edge), w)
        }
    }
}

/** One clue number in a [w] x [h] box at ([x], [y]). */
private fun DrawScope.drawClueCell(v: Int, x: Float, y: Float, w: Float, h: Float, color: ClueColors) {
    drawRect(CLUE_BG, Offset(x, y), Size(w, h))
    val stroke = if (color.bad) minOf(w, h) * 0.08f else 1f
    drawRect(if (color.bad) ERROR else CLUE_LINE, Offset(x, y), Size(w, h), style = Stroke(stroke))
    drawNumber(v, x + w / 2, y + h / 2, w, h, color.text)
}

/** [v] centred at ([cx], [cy]), sized to its [w] x [h] box (a two-digit number by width). */
private fun DrawScope.drawNumber(v: Int, cx: Float, cy: Float, w: Float, h: Float, color: Color) {
    val paint = android.graphics.Paint().apply {
        isAntiAlias = true
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = minOf(h * 0.62f, w * (if (v >= 10) 0.48f else 0.62f))
        isFakeBoldText = true
        this.color = color.toArgb()
    }
    val baseline = cy - (paint.descent() + paint.ascent()) / 2
    drawContext.canvas.nativeCanvas.drawText(v.toString(), cx, baseline, paint)
}

/**
 * Nonogram's drag: the origin cell toggles to the mode's mark (or clears when it already
 * holds it), and the drag paints that over cells still in the origin's old state, so a
 * sweep never overwrites other marks. Cells are (row, col).
 */
private class PaintDrag {
    private var last: Pair<Int, Int>? = null
    private var target = IrregularNonogramEngine.UNSET
    private var paintOver = IrregularNonogramEngine.UNSET

    private fun mark(mode: NonogramMode) =
        if (mode == NonogramMode.CROSS) IrregularNonogramEngine.CROSSED else IrregularNonogramEngine.FILLED

    fun start(cell: Pair<Int, Int>?, mode: NonogramMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null) { last = null; return }
        val (r, c) = cell
        val current = IrregularNonogramEngine.state(values, r, c)
        paintOver = current
        target = if (current == mark(mode)) IrregularNonogramEngine.UNSET else mark(mode)
        set(c, r, target)
        last = cell
    }

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val prev = last ?: return
        if (cell == null || cell == prev) return
        val (r, c) = cell
        if (IrregularNonogramEngine.state(values, r, c) == paintOver) set(c, r, target)
        last = cell
    }

    fun end() { last = null }

    fun tap(r: Int, c: Int, mode: NonogramMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val current = IrregularNonogramEngine.state(values, r, c)
        set(c, r, if (current == mark(mode)) IrregularNonogramEngine.UNSET else mark(mode))
    }
}
