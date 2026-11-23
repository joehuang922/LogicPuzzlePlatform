package com.puzzleplatform.player.ui.board

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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.MannequinGate2Engine
import com.puzzleplatform.player.puzzle.MannequinGate2Rules
import com.puzzleplatform.player.puzzle.ShadeCycle
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot

// No rooms, so shading is black as in the print (and as on the web board); the lines are
// drawn on top in a mid gray that shows on both white and black.
private val GRID_BG = Color.White
private val GRID_LINE = Color(0xFF222222)
private val SHADE_FILL = Color(0xFF111111)
private val LINE_COLOR = Color(0xFF9A9A9A)
private val ERROR_COLOR = Color(0xFFDD3333)
private val DRAFT_COLOR = Color(0xFF3B7DD8)
private val MARK_COLOR = Color(0xFF555555)

/** How near a cell's centre (in cells) a drag must pass to add that cell to a drawn line. */
private const val CAPTURE = 0.4f

/**
 * Draw [line] (cells as (row, col)) centre to centre, each end extended a quarter cell
 * past its centre, like the print. Shared with the mini board.
 */
fun DrawScope.drawGateLine(line: List<Pair<Int, Int>>, cell: Float, origin: Offset, color: Color, width: Float) {
    if (line.size < 2) return
    val pts = line.map { (r, c) -> Offset(origin.x + (c + 0.5f) * cell, origin.y + (r + 0.5f) * cell) }.toMutableList()
    fun extend(a: Offset, b: Offset): Offset {
        val d = a - b
        val len = hypot(d.x, d.y).takeIf { it > 0f } ?: 1f
        return a + d / len * (cell * 0.28f)
    }
    pts[0] = extend(pts[0], pts[1])
    pts[pts.size - 1] = extend(pts[pts.size - 1], pts[pts.size - 2])
    val path = Path().apply {
        moveTo(pts[0].x, pts[0].y)
        for (p in pts.drop(1)) lineTo(p.x, p.y)
    }
    drawPath(path, color, style = Stroke(width = width, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

/**
 * Compose Canvas renderer for Mannequin Gate 2 (puzzle type 43), the analog of
 * frontend/src/components/MannequinGate2Board.tsx.
 *
 * Play: the shared shade/mark tap cycle through [onTapCell] (empty -> shaded -> marked).
 * Shaded cells are black, marks are dots, and the gray lines are drawn on top. With
 * [liveValidate] a line that already breaks a rule ([MannequinGate2Rules.badLines]) is red.
 *
 * The Admin editor passes [onDrawLine] to draw a line by dragging from cell to cell
 * (diagonals too; a cell joins once the finger nears its centre, and going back onto the
 * previous cell undoes a step) and [onEditTapCell] for taps; play taps are off then.
 */
@Composable
fun MannequinGate2Board(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    onDrawLine: ((List<Pair<Int, Int>>) -> Unit)? = null,
    onEditTapCell: ((col: Int, row: Int) -> Unit)? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val board = remember(puzzle.id, puzzle.canonRepr) { MannequinGate2Engine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows <= 0 || cols <= 0) return

    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val onDraw = rememberUpdatedState(onDrawLine)
    val onEdit = rememberUpdatedState(onEditTapCell)
    val drawing = onDrawLine != null
    var draft by remember(puzzle.id) { mutableStateOf<List<Pair<Int, Int>>>(emptyList()) }

    fun cellNear(col: Float, row: Float): Pair<Int, Int>? {
        val c = floor(col).toInt()
        val r = floor(row).toInt()
        if (r !in 0 until rows || c !in 0 until cols) return null
        return if (hypot(col - (c + 0.5f), row - (r + 0.5f)) <= CAPTURE) r to c else null
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            val edit = onEdit.value
            if (edit != null) edit(col, row) else if (!drawing) onTap.value(col, row)
        },
        onDrawStartPrecise = if (!drawing) null else { col, row ->
            draft = listOfNotNull(cellNear(col, row))
        },
        onDrawToPrecise = if (!drawing) null else { col, row ->
            val cell = cellNear(col, row)
            val cur = draft
            if (cell != null) {
                if (cur.isEmpty()) {
                    draft = listOf(cell)
                } else {
                    val last = cur.last()
                    val neighbour = cell != last && maxOf(abs(cell.first - last.first), abs(cell.second - last.second)) == 1
                    if (neighbour) {
                        draft = when {
                            cur.size >= 2 && cur[cur.size - 2] == cell -> cur.dropLast(1)
                            cell in cur -> cur
                            else -> cur + cell
                        }
                    }
                }
            }
        },
        onDrawEnd = if (!drawing) null else {
            {
                val done = draft
                draft = emptyList()
                if (done.size >= 2) onDraw.value?.invoke(done)
            }
        },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        val values = valuesState.value
        val states = MannequinGate2Engine.states(board, values)
        drawRect(GRID_BG, Offset.Zero, Size(boardW, boardH))
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (states[r][c] == ShadeCycle.SHADED) drawRect(SHADE_FILL, Offset(c * cell, r * cell), Size(cell, cell))
            }
        }
        val thin = cell * 0.02f
        for (r in 1 until rows) drawLine(GRID_LINE, Offset(0f, r * cell), Offset(boardW, r * cell), thin)
        for (c in 1 until cols) drawLine(GRID_LINE, Offset(c * cell, 0f), Offset(c * cell, boardH), thin)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (states[r][c] == ShadeCycle.MARKED) {
                    drawCircle(MARK_COLOR, cell * 0.09f, Offset((c + 0.5f) * cell, (r + 0.5f) * cell))
                }
            }
        }

        val bad = if (liveValidate) MannequinGate2Rules.badLines(board, states) else emptySet()
        board.lines.forEachIndexed { i, line ->
            drawGateLine(line, cell, Offset.Zero, if (i in bad) ERROR_COLOR else LINE_COLOR, cell * 0.17f)
        }
        if (draft.size >= 2) drawGateLine(draft, cell, Offset.Zero, DRAFT_COLOR, cell * 0.17f)
        for ((r, c) in draft) {
            drawRect(DRAFT_COLOR, Offset(c * cell + cell * 0.06f, r * cell + cell * 0.06f), Size(cell * 0.88f, cell * 0.88f), style = Stroke(cell * 0.04f))
        }

        drawRect(GRID_LINE, Offset.Zero, Size(boardW, boardH), style = Stroke(width = cell * 0.06f))
    }
}
