package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
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
import com.puzzleplatform.player.puzzle.RippleEffectDraft
import com.puzzleplatform.player.puzzle.RippleEffectEngine

private val GRID_BG = Color.White
private val CLUE_BG = Color(0xFFF1F1F1)
private val LINE = Color.Black
private val THIN_LINE = Color(0xFFBBBBBB)
private val CLUE_COLOR = Color(0xFF111111)
private val USER_COLOR = Color(0xFF2563EB)
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for Ripple Effect (puzzle type 25), the analog of
 * frontend/src/components/RippleEffectBoard.tsx.
 *
 * The room partition is fixed in the canon, so — unlike Fillomino — there's no wall
 * mode: a tap just selects a non-clue cell, and the caller shows a [DigitBar] to
 * enter a (possibly multi-digit) value. Clue cells are locked and shown on a grey
 * ground in bold black; player entries are blue. Thick lines are the canon room
 * borders plus the perimeter; interior cell separators are thin grey. Rendering and
 * pan/zoom run through [ZoomableBoard].
 */
@Composable
fun RippleEffectBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { RippleEffectEngine.parseCells(puzzle) }
    val edges = remember(puzzle.id) { RippleEffectEngine.parseEdges(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values through state.
    val selectedState = rememberUpdatedState(selectedCell)
    val onSelect = rememberUpdatedState(onSelectCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            if ((cells.getOrNull(row)?.getOrNull(col) ?: 0) > 0) return@ZoomableBoard // clue locked
            val key = RippleEffectEngine.cellKey(col, row)
            onSelect.value(if (selectedState.value == key) null else key)
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Clue cells sit on a grey ground; the selected cell is tinted on top.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((cells.getOrNull(r)?.getOrNull(c) ?: 0) > 0) {
                    drawRect(CLUE_BG, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
                }
            }
        }
        selectedCell?.toCellColRow()?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()

        // Horizontal lines: line index r (y = r*cell), one segment per column. A line is
        // thick on the perimeter or where the canon marks a room border below cell[r-1][c].
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val isRoomEdge = !isBorder && edges.h[r - 1][c] == 1
                val thickLine = isBorder || isRoomEdge
                drawLine(
                    if (thickLine) LINE else THIN_LINE,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (thickLine) thick else thin,
                )
            }
        }
        // Vertical lines: line index c (x = c*cell), one segment per row.
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            for (r in 0 until rows) {
                val isRoomEdge = !isBorder && edges.v[r][c - 1] == 1
                val thickLine = isBorder || isRoomEdge
                drawLine(
                    if (thickLine) LINE else THIN_LINE,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (thickLine) thick else thin,
                )
            }
        }

        // Numbers on top: clues bold black, player entries blue; font shrinks for
        // multi-digit values so e.g. "12" still fits one cell.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
                val value: Int
                val color: Color
                val bold: Boolean
                if (clue > 0) {
                    value = clue; color = CLUE_COLOR; bold = true
                } else {
                    val entered = userValues[RippleEffectEngine.cellKey(c, r)] ?: 0
                    if (entered <= 0) continue
                    value = entered; color = USER_COLOR; bold = false
                }
                drawNumber(value, c, r, cell, color, bold)
            }
        }
    }
}

private val PROBLEM_FILL = Color(0xFFFFE0E0)
private val PROBLEM_WALL = Color(0xFFDD3333)

/**
 * The Admin review editor's board for a [RippleEffectDraft] being authored. It draws the
 * draft's walls as they are, so an interim layout shows faithfully: a room a wall runs
 * into without closing it off is tinted red and that wall drawn red. Given numbers sit on
 * grey cells as on the player board; every cell is tappable. [selectedCell] is "col,row".
 */
@Composable
fun RippleEffectDraftBoard(
    draft: RippleEffectDraft,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    selectedCell: String? = null,
) {
    val rows = draft.height
    val cols = draft.width
    if (rows <= 0 || cols <= 0) return
    val ids = remember(draft) { draft.regionIds() }
    val badRegions = remember(draft) { draft.roomsWithDanglingWalls(ids) }

    val draftState = rememberUpdatedState(draft)
    val idsState = rememberUpdatedState(ids)
    val badState = rememberUpdatedState(badRegions)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = "admin-ripple-effect-draft-${rows}x$cols",
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
    ) { cell ->
        val d = draftState.value
        val roomIds = idsState.value
        val bad = badState.value
        if (d.height != rows || d.width != cols) return@ZoomableBoard

        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(cols * cell, rows * cell))
        for (r in 0 until rows) for (c in 0 until cols) {
            val fill = when {
                roomIds[r][c] in bad -> PROBLEM_FILL
                (r to c) in d.clues -> CLUE_BG
                else -> continue
            }
            drawRect(fill, Offset(c * cell, r * cell), Size(cell, cell))
        }
        selectedState.value?.toCellColRow()?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        fun edge(from: Offset, to: Offset, wall: Boolean, dangling: Boolean) = drawLine(
            when {
                dangling -> PROBLEM_WALL
                wall -> LINE
                else -> THIN_LINE
            },
            from,
            to,
            strokeWidth = if (wall) thick else thin,
            cap = StrokeCap.Square,
        )
        // Interior lines first so the thick ones paint over the thin ones they meet.
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            val wall = d.hWalls[r][c]
            edge(Offset(c * cell, (r + 1) * cell), Offset((c + 1) * cell, (r + 1) * cell), wall, wall && roomIds[r][c] == roomIds[r + 1][c])
        }
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            val wall = d.vWalls[r][c]
            edge(Offset((c + 1) * cell, r * cell), Offset((c + 1) * cell, (r + 1) * cell), wall, wall && roomIds[r][c] == roomIds[r][c + 1])
        }
        drawRect(LINE, Offset(0f, 0f), Size(cols * cell, rows * cell), style = Stroke(thick))

        for ((at, clue) in d.clues) {
            val (r, c) = at
            if (r in 0 until rows && c in 0 until cols) drawNumber(clue, c, r, cell, CLUE_COLOR, bold = true)
        }
    }
}

/** Parse a "col,row" selection key into (col, row), or null if malformed. */
private fun String.toCellColRow(): Pair<Int, Int>? {
    val parts = split(",")
    if (parts.size != 2) return null
    val col = parts[0].toIntOrNull() ?: return null
    val row = parts[1].toIntOrNull() ?: return null
    return col to row
}

/** Draw a (possibly multi-digit) number centered in cell (col, row). */
private fun DrawScope.drawNumber(value: Int, col: Int, row: Int, cell: Float, color: Color, bold: Boolean) {
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
        this.typeface = if (bold) {
            android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        } else {
            android.graphics.Typeface.DEFAULT
        }
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
