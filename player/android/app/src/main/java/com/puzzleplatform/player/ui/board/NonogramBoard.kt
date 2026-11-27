package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.NonogramEngine
import com.puzzleplatform.player.puzzle.NonogramEngine.ClueStatus
import com.puzzleplatform.player.puzzle.NonogramHinter

private val GRID_BG = Color.White
private val BAND_BG = Color(0xFFF2F2F2)
private val CORNER_BG = Color(0xFFE8E8E8)
// Preview palette: unmarked ("default") cells are light grey, filled cells black, and
// crossed ("marked") cells white, so both solved states stand out from the undecided
// ground. The border frames the grey preview against the slightly-lighter static corner.
private val THUMB_BG = Color(0xFFD9D9D9)
private val THUMB_BORDER = Color(0xFFAAAAAA)
private val THUMB_FILL = Color.Black
private val THUMB_CROSS = Color.White
private val GRID_LINE = Color(0xFFBBBBBB)
private val GRID_LINE_MAJOR = Color(0xFF333333)
private val BORDER = Color(0xFF333333)
private val FILL_COLOR = Color(0xFF222222)
private val CROSS_COLOR = Color(0xFF999999)
private val CLUE_NORMAL = Color(0xFF333333)
private val CLUE_SATISFIED = Color(0xFFAAAAAA)
private val CLUE_ERROR = Color(0xFFDD3333)
private val ERROR_FILL = Color(0xFFDD3333)
// Hint highlights (docs/auto-solve): amber focus lines, blue settled cells (matches web).
private val HINT_LINE_FILL = Color(0x4DFFC107)
private val HINT_CELL = Color(0xFF1976D2)
// Line labels: a light strip between each clue band and the grid.
private val LABEL_BG = Color(0xFFFAFAFA)
private val LABEL_TEXT = Color(0xFF555555)

/**
 * Clue-band depth adapts to the longest clue line so every number stays visible, however
 * many a line has. The band is sized from the clue data (not zoom), so it stays fixed as
 * the grid pans/zooms, per the design note: [PER_CLUE_DEPTH] is the room reserved for one
 * number, so the band holds that times the longest line, clamped to [MIN_BAND_DEPTH] ..
 * [MAX_BAND_DEPTH]. Past the point where [MAX_BAND_DEPTH] can hold them all at full size,
 * the numbers shrink to fit instead (see [drawRowClues]/[drawColClues]) — so there is no
 * hard cap on clue length, just progressively smaller text for very long lines.
 */
private val PER_CLUE_DEPTH = 13.dp
private val MIN_BAND_DEPTH = 84.dp
private val MAX_BAND_DEPTH = 176.dp
/** Largest grid cell (zoom-in stop) and the auto-zoom target, matching other boards. */
private val MAX_CELL = 40.dp
private val AUTO_CELL = 26.dp
private val ENTRY_FLOOR = 18.dp
/**
 * Line labels (row/column numbers at every 5th, thick, separator): the strip the grid
 * gives up for them. The row strip is wider than the column strip is tall, since row
 * numbers are written across it ("100" needs more room than a digit's height).
 */
private val ROW_LABEL_W = 22.dp
private val COL_LABEL_H = 16.dp
private val LABEL_TEXT_SIZE = 11.dp

enum class NonogramMode { FILL, CROSS }

/**
 * Compose Canvas renderer for Nonogram (puzzle type 6), the analog of
 * frontend/src/components/NonogramBoard.tsx, adapted to a phone with STICKY HINTS:
 * the row-clue band stays pinned to the left edge and the column-clue band to the
 * top edge while the inner grid pans/zooms beneath them, so a clue is always visible
 * and aligned to its row/column no matter where the grid is scrolled. This is the
 * frozen-pane layout requested for the port — see [NonogramTransform] for the math.
 *
 * Input mirrors the web board through a fill/cross [mode] toggle (there's no
 * right-click on touch): one-finger drag paints in the active mode and dragging back
 * over a just-painted cell erases it (the first cell of a gesture fixes draw-vs-erase,
 * like [MasyuBoard]); two fingers pan and pinch-zoom. Crosses persist in the saved
 * answer (a deliberate divergence from the web extractor).
 */
@Composable
fun NonogramBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    mode: NonogramMode,
    onSetCell: (col: Int, row: Int, state: Int) -> Unit,
    // Hint highlights: the lines a hint points at (tinted across clue band and grid), and
    // the cells it settles once the player asks to see them ("col,row" -> 1 fill / 2 cross).
    hintLines: List<NonogramHinter.Line> = emptyList(),
    hintCells: Map<String, Int> = emptyMap(),
    // Row/column numbers beside every 5th (thick) line, in a strip the grid gives up.
    showLabels: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val clues = remember(puzzle.id) { NonogramEngine.parseClues(puzzle) }
    val rows = clues.rows
    val cols = clues.cols
    if (rows == 0 || cols == 0) return

    val analysis = if (liveValidate) NonogramEngine.analyze(puzzle, userValues) else null
    val cellErrors = analysis?.cellErrors ?: emptySet()
    val rowClueErrors = analysis?.rowClueErrors ?: emptySet()
    val colClueErrors = analysis?.colClueErrors ?: emptySet()

    // Per-clue satisfied/error status (grey/red hint coloring); satisfied is always
    // shown as a solving aid, error only when live-validate is on (matches web).
    val rowStatus = remember(puzzle.id, userValues) {
        List(rows) { r -> NonogramEngine.rowClueStatus(puzzle, userValues, r) }
    }
    val colStatus = remember(puzzle.id, userValues) {
        List(cols) { c -> NonogramEngine.colClueStatus(puzzle, userValues, c) }
    }

    val valuesState = rememberUpdatedState(userValues)
    val onSet = rememberUpdatedState(onSetCell)
    val modeState = rememberUpdatedState(mode)

    val density = LocalDensity.current

    // Size the clue band from the longest clue line so none of its numbers get clipped;
    // the depth is a function of the clue data only, so it's stable across pan/zoom.
    val maxClueLen = remember(clues) {
        maxOf(
            clues.rowClues.maxOfOrNull { it.size } ?: 0,
            clues.colClues.maxOfOrNull { it.size } ?: 0,
            1,
        )
    }

    // Each number's width in em, so clues are spaced by their real widths (see
    // [NonogramClueLayout]) rather than packed into equal slots.
    val rowWidths = remember(clues) { clues.rowClues.map { line -> FloatArray(line.size) { textWidthEm(line[it].toString()) } } }
    val colWidths = remember(clues) { clues.colClues.map { line -> FloatArray(line.size) { textWidthEm(line[it].toString()) } } }

    // The transform in use before the latest re-creation, so toggling labels keeps the
    // player's zoom and scroll position.
    val lastTransform = remember(puzzle.id) { arrayOfNulls<NonogramTransform>(1) }

    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        val side = boardSide(maxWidth)
        val vpx = with(density) { side.toPx() }
        val perCluePx = with(density) { PER_CLUE_DEPTH.toPx() }
        val minBandPx = with(density) { MIN_BAND_DEPTH.toPx() }
        val maxBandPx = with(density) { MAX_BAND_DEPTH.toPx() }
        val bandPx = (maxClueLen * perCluePx).coerceIn(minBandPx, maxBandPx)
        val maxCellPx = with(density) { MAX_CELL.toPx() }
        val autoCellPx = with(density) { AUTO_CELL.toPx() }
        val entryFloorPx = with(density) { ENTRY_FLOOR.toPx() }
        val rowLabelPx = if (showLabels) with(density) { ROW_LABEL_W.toPx() } else 0f
        val colLabelPx = if (showLabels) with(density) { COL_LABEL_H.toPx() } else 0f
        val labelTextPx = with(density) { LABEL_TEXT_SIZE.toPx() }
        // The grid starts past the clue band plus the label strip on each axis.
        val leftPx = bandPx + rowLabelPx
        val topPx = bandPx + colLabelPx
        val gridW = vpx - leftPx
        val gridH = vpx - topPx // square canvas; grid area is the square minus bands

        val transform = remember(cols, rows, puzzle.id, vpx, showLabels) {
            NonogramTransform(cols, rows, gridW, gridH, leftPx, topPx, maxCellPx, autoCellPx, entryFloorPx).also { t ->
                lastTransform[0]?.let { prev -> if (prev.cols == cols && prev.rows == rows) t.adoptView(prev) }
                lastTransform[0] = t
            }
        }
        var version by remember(transform) { mutableStateOf(0) }

        // Per-gesture paint state, driven by detectBoardGestures' cell callbacks.
        val drag = remember(puzzle.id) { NonogramDragState() }

        val canvasMod = Modifier
            .size(side)
            .pointerInput(transform) {
                detectBoardGestures(
                    transformEnabled = transform.zoomable,
                    drawEnabled = true,
                    onTap = { off ->
                        transform.cellAt(off.x, off.y)?.let { (c, r) ->
                            drag.paintSingle(c, r, modeState.value, valuesState.value) { col, row, st -> onSet.value(col, row, st) }
                        }
                    },
                    onDragStart = { off ->
                        drag.start(transform.cellAt(off.x, off.y), modeState.value, valuesState.value) { c, r, st -> onSet.value(c, r, st) }
                    },
                    onDrag = { off -> drag.moveTo(transform.cellAt(off.x, off.y), valuesState.value) { c, r, st -> onSet.value(c, r, st) } },
                    onDragEnd = { drag.end() },
                    onTransform = { centroid, pan, zoom ->
                        transform.transform(centroid.x, centroid.y, pan.x, pan.y, zoom)
                        version++
                    },
                )
            }

        Canvas(canvasMod) {
            version // read so the draw re-runs after a gesture
            val cell = transform.cellPx
            val panX = transform.panX
            val panY = transform.panY

            // Backgrounds: bands, corner, label strips, grid.
            drawRect(CORNER_BG, Offset(0f, 0f), Size(leftPx, topPx))
            drawRect(BAND_BG, Offset(leftPx, 0f), Size(gridW, bandPx))   // column-clue band
            drawRect(BAND_BG, Offset(0f, topPx), Size(bandPx, gridH))    // row-clue band
            if (showLabels) {
                drawRect(LABEL_BG, Offset(leftPx, bandPx), Size(gridW, colLabelPx))
                drawRect(LABEL_BG, Offset(bandPx, topPx), Size(rowLabelPx, gridH))
            }

            // Live thumbnail of the filled cells in the static corner, mirroring the
            // web board's upper-left preview so the emerging picture is always visible
            // regardless of pan/zoom.
            drawNonogramThumbnail(cols, rows, bandPx, valuesState.value)

            // --- Grid region (pans in both axes) ---
            clipRect(left = leftPx, top = topPx, right = vpx, bottom = vpx) {
                translate(leftPx + panX, topPx + panY) {
                    drawNonogramGrid(cols, rows, cell, valuesState.value, cellErrors, liveValidate)
                    drawHintGrid(cols, rows, cell, hintLines, hintCells)
                }
            }

            // --- Column-clue band (pinned to top, pans horizontally) ---
            clipRect(left = leftPx, top = 0f, right = vpx, bottom = bandPx) {
                translate(leftPx + panX, 0f) {
                    for (line in hintLines) if (!line.isRow) drawRect(HINT_LINE_FILL, Offset(line.index * cell, 0f), Size(cell, bandPx))
                    drawColClues(clues, colWidths, cell, bandPx, colStatus, colClueErrors, liveValidate)
                }
            }

            // --- Row-clue band (pinned to left, pans vertically) ---
            clipRect(left = 0f, top = topPx, right = bandPx, bottom = vpx) {
                translate(0f, topPx + panY) {
                    for (line in hintLines) if (line.isRow) drawRect(HINT_LINE_FILL, Offset(0f, line.index * cell), Size(bandPx, cell))
                    drawRowClues(clues, rowWidths, cell, bandPx, rowStatus, rowClueErrors, liveValidate)
                }
            }

            // --- Line labels (pan with the grid along their own axis) ---
            if (showLabels) {
                clipRect(left = leftPx, top = bandPx, right = vpx, bottom = topPx) {
                    translate(leftPx + panX, bandPx) {
                        drawColLabels(cols, cell, colLabelPx, labelTextPx)
                    }
                }
                clipRect(left = bandPx, top = topPx, right = leftPx, bottom = vpx) {
                    translate(bandPx, topPx + panY) {
                        drawRowLabels(rows, cell, rowLabelPx, labelTextPx)
                    }
                }
            }
        }
    }
}

/** Draw the grid cells, gridlines and border in grid-local coordinates. */
private fun DrawScope.drawNonogramGrid(
    cols: Int,
    rows: Int,
    cell: Float,
    values: Map<String, Int>,
    cellErrors: Set<String>,
    liveValidate: Boolean,
) {
    val boardW = cols * cell
    val boardH = rows * cell
    drawRect(GRID_BG, Offset(0f, 0f), Size(boardW, boardH))

    // Cell contents.
    for (r in 0 until rows) {
        for (c in 0 until cols) {
            val key = "$c,$r"
            val v = values[key] ?: NonogramEngine.UNSET
            val x = c * cell
            val y = r * cell
            val err = liveValidate && cellErrors.contains(key)
            when (v) {
                NonogramEngine.FILLED -> drawRect(
                    if (err) ERROR_FILL else FILL_COLOR,
                    Offset(x + cell * 0.06f, y + cell * 0.06f),
                    Size(cell * 0.88f, cell * 0.88f),
                )
                NonogramEngine.CROSSED -> {
                    val s = cell * 0.22f
                    val cx = x + cell / 2
                    val cy = y + cell / 2
                    val color = if (err) ERROR_FILL else CROSS_COLOR
                    val w = cell * 0.08f
                    drawLine(color, Offset(cx - s, cy - s), Offset(cx + s, cy + s), w, cap = StrokeCap.Round)
                    drawLine(color, Offset(cx + s, cy - s), Offset(cx - s, cy + s), w, cap = StrokeCap.Round)
                }
            }
        }
    }

    // Gridlines: every 5th line is major (matches web's %5 emphasis).
    for (r in 0..rows) {
        val y = r * cell
        val major = r % 5 == 0
        drawLine(if (major) GRID_LINE_MAJOR else GRID_LINE, Offset(0f, y), Offset(boardW, y), if (major) 2f else 1f)
    }
    for (c in 0..cols) {
        val x = c * cell
        val major = c % 5 == 0
        drawLine(if (major) GRID_LINE_MAJOR else GRID_LINE, Offset(x, 0f), Offset(x, boardH), if (major) 2f else 1f)
    }
}

/** Hint overlay in grid-local coordinates: tinted focus lines, then the settled cells. */
private fun DrawScope.drawHintGrid(
    cols: Int,
    rows: Int,
    cell: Float,
    hintLines: List<NonogramHinter.Line>,
    hintCells: Map<String, Int>,
) {
    for (line in hintLines) {
        if (line.isRow) drawRect(HINT_LINE_FILL, Offset(0f, line.index * cell), Size(cols * cell, cell))
        else drawRect(HINT_LINE_FILL, Offset(line.index * cell, 0f), Size(cell, rows * cell))
    }
    for ((key, value) in hintCells) {
        val (c, r) = key.split(",").map { it.toInt() }
        val x = c * cell
        val y = r * cell
        if (value == NonogramEngine.FILLED) {
            drawRect(HINT_CELL.copy(alpha = 0.6f), Offset(x + cell * 0.12f, y + cell * 0.12f), Size(cell * 0.76f, cell * 0.76f))
        } else {
            val s = cell * 0.22f
            val cx = x + cell / 2
            val cy = y + cell / 2
            val w = cell * 0.1f
            drawLine(HINT_CELL, Offset(cx - s, cy - s), Offset(cx + s, cy + s), w, cap = StrokeCap.Round)
            drawLine(HINT_CELL, Offset(cx + s, cy - s), Offset(cx - s, cy + s), w, cap = StrokeCap.Round)
        }
    }
}

/**
 * Draw a miniature of the currently-filled cells inside the static corner, the analog
 * of the web board's upper-left thumbnail preview. Only filled (1) cells are shown —
 * crosses and unset cells stay blank, so the solver sees the emerging picture. The
 * thumbnail is aspect-preserving and centered in the corner, with a small margin.
 */
private fun DrawScope.drawNonogramThumbnail(
    cols: Int,
    rows: Int,
    bandPx: Float,
    values: Map<String, Int>,
) {
    if (cols == 0 || rows == 0) return
    val margin = bandPx * 0.12f
    val avail = bandPx - margin * 2
    if (avail <= 0f) return
    val thumbCell = minOf(avail / cols, avail / rows)
    if (thumbCell <= 0f) return

    val thumbW = thumbCell * cols
    val thumbH = thumbCell * rows
    val ox = (bandPx - thumbW) / 2
    val oy = (bandPx - thumbH) / 2

    drawRect(THUMB_BG, Offset(ox, oy), Size(thumbW, thumbH))
    for (r in 0 until rows) {
        for (c in 0 until cols) {
            val color = when (values["$c,$r"] ?: NonogramEngine.UNSET) {
                NonogramEngine.FILLED -> THUMB_FILL
                NonogramEngine.CROSSED -> THUMB_CROSS
                else -> continue
            }
            drawRect(color, Offset(ox + c * thumbCell, oy + r * thumbCell), Size(thumbCell, thumbCell))
        }
    }
    drawRect(THUMB_BORDER, Offset(ox, oy), Size(thumbW, thumbH), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1f))
}

/**
 * Row clues, right-aligned in the left band; row r's numbers sit at grid row r. Numbers
 * are spaced by their measured widths plus a fixed gap ([NonogramClueLayout.row]), so
 * runs of two-digit clues stay apart when a long line shrinks to fit the band.
 */
private fun DrawScope.drawRowClues(
    clues: NonogramEngine.Clues,
    widths: List<FloatArray>,
    cell: Float,
    bandPx: Float,
    rowStatus: List<List<ClueStatus>>,
    rowClueErrors: Set<String>,
    liveValidate: Boolean,
) {
    // Capped by the row height too, so zoomed-out rows don't overlap.
    val maxSize = (cell * 0.5f).coerceIn(18f, 34f).coerceAtMost(cell * NonogramClueLayout.CROSS_FILL)
    for (r in 0 until clues.rows) {
        val clue = clues.rowClues[r]
        val yc = r * cell + cell / 2
        val layout = NonogramClueLayout.row(widths[r], maxSize, bandPx)
        for (i in clue.indices) {
            val color = clueColor(rowStatus.getOrNull(r)?.getOrNull(i), rowClueErrors.contains("$r:$i"), liveValidate)
            drawClueText(clue[i].toString(), layout.centers[i], yc, layout.textSize, color)
        }
    }
}

/**
 * Column clues, bottom-aligned in the top band; column c's numbers sit at grid col c,
 * sized so a two-digit number fits its column's width ([NonogramClueLayout.col]).
 */
private fun DrawScope.drawColClues(
    clues: NonogramEngine.Clues,
    widths: List<FloatArray>,
    cell: Float,
    bandPx: Float,
    colStatus: List<List<ClueStatus>>,
    colClueErrors: Set<String>,
    liveValidate: Boolean,
) {
    val maxSize = (cell * 0.5f).coerceIn(18f, 34f)
    for (c in 0 until clues.cols) {
        val clue = clues.colClues[c]
        val xc = c * cell + cell / 2
        val layout = NonogramClueLayout.col(widths[c], maxSize, cell, bandPx)
        for (i in clue.indices) {
            val color = clueColor(colStatus.getOrNull(c)?.getOrNull(i), colClueErrors.contains("$c:$i"), liveValidate)
            drawClueText(clue[i].toString(), xc, layout.centers[i], layout.textSize, color)
        }
    }
}

/**
 * Column numbers in the strip above the grid (grid-local x), one centered on every
 * 5th line — or 10th, 20th, ... when zoomed out too far for them to fit 5 apart.
 */
private fun DrawScope.drawColLabels(cols: Int, cell: Float, stripPx: Float, textPx: Float) {
    val size = textPx.coerceAtMost(stripPx * 0.8f)
    val extent = textWidthEm(cols.toString()) * size
    val step = NonogramClueLayout.labelStep(cell, extent)
    for (line in NonogramClueLayout.labelLines(cols, step)) {
        val x = NonogramClueLayout.labelCenter(line, cell, cols, extent)
        drawClueText(line.toString(), x, stripPx / 2, size, LABEL_TEXT)
    }
}

/** Row numbers in the strip left of the grid (grid-local y), as [drawColLabels]. */
private fun DrawScope.drawRowLabels(rows: Int, cell: Float, stripPx: Float, textPx: Float) {
    // Shrink to fit the strip's width when the numbers run to three digits.
    val size = minOf(textPx, stripPx * 0.88f / textWidthEm(rows.toString()))
    val extent = size // a number's height is about its text size
    val step = NonogramClueLayout.labelStep(cell, extent)
    for (line in NonogramClueLayout.labelLines(rows, step)) {
        val y = NonogramClueLayout.labelCenter(line, cell, rows, extent)
        drawClueText(line.toString(), stripPx / 2, y, size, LABEL_TEXT)
    }
}

/** Paint used only to measure clue widths (bold, like the drawn clues). */
private val measurePaint by lazy {
    android.graphics.Paint().apply {
        textSize = 100f
        isAntiAlias = true
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
}

/** [text]'s advance width at text size 1, in the clue font. */
private fun textWidthEm(text: String): Float = measurePaint.measureText(text) / 100f

private fun clueColor(status: ClueStatus?, isError: Boolean, liveValidate: Boolean): Color = when {
    status == ClueStatus.SATISFIED -> CLUE_SATISFIED
    (status == ClueStatus.ERROR || isError) && liveValidate -> CLUE_ERROR
    else -> CLUE_NORMAL
}

private fun DrawScope.drawClueText(text: String, cx: Float, cy: Float, textSize: Float, color: Color) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}

/**
 * Tracks a single paint gesture. The first cell fixes both the target state (draw the
 * active mode's mark, or erase if that cell already holds it) and the "paint-over"
 * state — the state the origin cell held before the gesture. As the finger sweeps on,
 * only cells that currently match that origin state are changed; a cell holding
 * anything else is left untouched. This stops a drag from silently clobbering answers
 * already laid down (e.g. a fill-sweep won't erase crosses or overwrite other fills),
 * while a sweep across uniformly-empty (or uniformly-same) cells still paints the whole
 * line as before. Only the first cell may override an existing value, mirroring the
 * common nonogram convention and matching the request to disallow drag overrides.
 */
private class NonogramDragState {
    private var last: Pair<Int, Int>? = null
    private var target: Int = NonogramEngine.UNSET
    // The state the origin cell held before this gesture; only cells currently in this
    // state are affected by subsequent moveTo() calls.
    private var paintOver: Int = NonogramEngine.UNSET

    private fun markFor(mode: NonogramMode) =
        if (mode == NonogramMode.CROSS) NonogramEngine.CROSSED else NonogramEngine.FILLED

    fun start(cell: Pair<Int, Int>?, mode: NonogramMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null) { last = null; return }
        val (c, r) = cell
        val mark = markFor(mode)
        val current = values["$c,$r"] ?: NonogramEngine.UNSET
        paintOver = current
        target = if (current == mark) NonogramEngine.UNSET else mark
        set(c, r, target)
        last = cell
    }

    fun moveTo(cell: Pair<Int, Int>?, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        if (cell == null || cell == last) return
        val (c, r) = cell
        // Only paint cells that still match the origin's pre-drag state, so the sweep
        // can't override cells the player had already set to something else.
        if ((values["$c,$r"] ?: NonogramEngine.UNSET) == paintOver) {
            set(c, r, target)
        }
        last = cell
    }

    fun end() { last = null }

    /** A tap (no drag): toggle the single cell for the active mode. */
    fun paintSingle(c: Int, r: Int, mode: NonogramMode, values: Map<String, Int>, set: (Int, Int, Int) -> Unit) {
        val mark = markFor(mode)
        val current = values["$c,$r"] ?: NonogramEngine.UNSET
        set(c, r, if (current == mark) NonogramEngine.UNSET else mark)
    }
}
