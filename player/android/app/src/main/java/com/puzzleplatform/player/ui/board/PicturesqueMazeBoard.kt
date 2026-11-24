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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.PicturesqueMazeEngine
import kotlin.math.floor

private val PAPER = Color.White
private val WALL = Color(0xFF222222)
private val PATH_LINE = Color.White
private val ERROR = Color(0xFFDD3333)
private val ROUTE_FILL = Color(0xFFCFE3F7)
private val ENTRANCE_MARK = Color(0xFF2A7A2A)
private val EXIT_MARK = Color(0xFFCC3333)

/** Cells highlighted by the review editor: a colour per cell, drawn as an outline. */
typealias MazeCellMarks = List<Pair<Pair<Int, Int>, Color>>

/**
 * Compose Canvas renderer for Picturesque Maze (puzzle type 44), the analog of
 * frontend/src/components/PicturesqueMazeBoard.tsx.
 *
 * One path, always starting at the entrance cell. A one-finger drag from a path cell
 * continues the path from there (the cells after it are cut first) toward the finger,
 * one open step at a time: a wall never sends it sideways, stepping back retracts, and
 * a cell already on the path stops it ([PicturesqueMazeEngine.walkToward]). A tap on a
 * path cell cuts the path after it (on the entrance: clears it). Two fingers pan/zoom.
 * Changes go out through [onApplyChanges] ("h:r,c"/"v:r,c" -> 1, 0 drops the key).
 *
 * Path cells fill with the shared room shade so the picture builds on the board; a thin
 * white line shows the path's order and a dot its end. With [liveValidate] the end is
 * outlined red when it sits in a dead end. A small live preview of the picture sits
 * above (black on grey), the cells the collection thumbnail shows once solved.
 *
 * The Admin review editor passes [onEditTap] (fractional cell coordinates): taps then
 * edit instead of play, nothing is drawn by drag, the preview is left out, and
 * [showRoute] / [marks] overlay the computed route and the problem cells.
 */
@Composable
fun PicturesqueMazeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((col: Float, row: Float) -> Unit)? = null,
    showRoute: Boolean = false,
    marks: MazeCellMarks = emptyList(),
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val board = remember(puzzle.id, puzzle.canonRepr) { PicturesqueMazeEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows < 1 || cols < 1) return

    // The gesture closures outlive recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callbacks through state.
    val boardState = rememberUpdatedState(board)
    val valuesState = rememberUpdatedState(userValues)
    val onApply = rememberUpdatedState(onApplyChanges)
    val onEdit = rememberUpdatedState(onEditTap)
    val playing = onEditTap == null
    val drag = remember(puzzle.id) { MazeDrag() }

    val path = remember(board, userValues) { PicturesqueMazeEngine.path(board, userValues) }
    val drawn = path.size > 1
    val route = remember(board, showRoute) { if (showRoute) PicturesqueMazeEngine.solve(board).route else null }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (playing) {
            val picture = remember(board, path) {
                PicturesqueMazeEngine.pictureCells(board, if (drawn) path else emptyList(), PicturesqueMazeEngine.GROUND_ARGB)
            }
            PicturePreview(picture, rows, cols, PicturesqueMazeEngine.GROUND_ARGB)
        }

        ZoomableBoard(
            cols = cols,
            rows = rows,
            resetKey = puzzle.id,
            // Room for the entrance/exit markers outside the border.
            padCells = 0.8f,
            onTapCell = { col, row ->
                if (onEdit.value == null) {
                    val current = PicturesqueMazeEngine.path(boardState.value, valuesState.value)
                    val i = current.indexOf(row to col)
                    if (i >= 0) {
                        onApply.value(PicturesqueMazeEngine.changesTo(valuesState.value, current.take(i + 1)))
                    }
                }
            },
            onTapPrecise = { col, row -> onEdit.value?.invoke(col, row) },
            onDrawStartPrecise = if (playing) {
                { col, row -> drag.start(boardState.value, valuesState.value, row, col) }
            } else {
                null
            },
            onDrawToPrecise = if (playing) {
                { col, row -> drag.moveTo(boardState.value, row, col)?.let { onApply.value(it) } }
            } else {
                null
            },
            onDrawEnd = if (playing) {
                { drag.end() }
            } else {
                null
            },
        ) { cell ->
            drawMaze(board, cell, path, drawn, route, marks, liveValidate && playing, playing)
        }
    }
}

/**
 * A drag in progress. It keeps its own view of the path and values: the board's state
 * catches up only on recomposition, and a fast drag fires several moves in between.
 */
private class MazeDrag {
    private var path: List<Pair<Int, Int>>? = null
    private var values: Map<String, Int> = emptyMap()
    private var index = -1
    private var moved = false

    fun start(board: PicturesqueMazeEngine.Board, userValues: Map<String, Int>, row: Float, col: Float) {
        val current = PicturesqueMazeEngine.path(board, userValues)
        val i = current.indexOf(floor(row).toInt() to floor(col).toInt())
        if (i < 0) {
            path = null
            return
        }
        path = current
        values = userValues
        index = i
        moved = false
    }

    /** The changes this move makes, or null for none. */
    fun moveTo(board: PicturesqueMazeEngine.Board, row: Float, col: Float): Map<String, Int>? {
        var p = path ?: return null
        val cell = floor(row).toInt() to floor(col).toInt()
        if (!moved) {
            if (cell == p[index]) return null
            moved = true
            p = p.take(index + 1)
        }
        val next = PicturesqueMazeEngine.walkToward(board, p, row, col)
        val changes = PicturesqueMazeEngine.changesTo(values, next)
        path = next
        if (changes.isEmpty()) return null
        values = values.toMutableMap().apply {
            for ((k, v) in changes) if (v == 0) remove(k) else put(k, v)
        }
        return changes
    }

    fun end() {
        path = null
    }
}

private fun DrawScope.drawMaze(
    board: PicturesqueMazeEngine.Board,
    cell: Float,
    path: List<Pair<Int, Int>>,
    drawn: Boolean,
    route: List<Pair<Int, Int>>?,
    marks: MazeCellMarks,
    showDeadEnd: Boolean,
    playing: Boolean,
) {
    val rows = board.rows
    val cols = board.cols
    drawRect(PAPER, topLeft = Offset(0f, 0f), size = Size(cols * cell, rows * cell))

    route?.forEach { (r, c) -> drawRect(ROUTE_FILL, Offset(c * cell, r * cell), Size(cell, cell)) }
    if (drawn) {
        for ((r, c) in path) drawRect(BoardColors.ROOM_SHADE, Offset(c * cell, r * cell), Size(cell, cell))
        val line = Path()
        path.forEachIndexed { i, (r, c) ->
            val x = (c + 0.5f) * cell
            val y = (r + 0.5f) * cell
            if (i == 0) line.moveTo(x, y) else line.lineTo(x, y)
        }
        drawPath(line, PATH_LINE, style = Stroke(maxOf(1f, cell * 0.08f), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
    val end = path.lastOrNull()
    if (end != null && playing) {
        val centre = Offset((end.second + 0.5f) * cell, (end.first + 0.5f) * cell)
        drawCircle(PATH_LINE, cell * 0.18f, centre)
        drawCircle(WALL, cell * 0.18f, centre, style = Stroke(maxOf(1f, cell * 0.04f)))
        if (showDeadEnd && PicturesqueMazeEngine.endsInDeadEnd(board, path)) {
            val inset = cell * 0.1f
            drawRect(
                ERROR,
                Offset(end.second * cell + inset, end.first * cell + inset),
                Size(cell - 2 * inset, cell - 2 * inset),
                style = Stroke(maxOf(1.5f, cell * 0.1f)),
            )
        }
    }
    for ((rc, color) in marks) {
        val (r, c) = rc
        val inset = cell * 0.12f
        drawRect(color, Offset(c * cell + inset, r * cell + inset), Size(cell - 2 * inset, cell - 2 * inset), style = Stroke(maxOf(1f, cell * 0.08f)))
    }

    // Walls, the border included except at the openings, as one path.
    val walls = Path()
    fun seg(x1: Int, y1: Int, x2: Int, y2: Int) {
        walls.moveTo(x1 * cell, y1 * cell)
        walls.lineTo(x2 * cell, y2 * cell)
    }
    for (r in 0 until rows - 1) for (c in 0 until cols) if (board.wallsH[r][c] == 1) seg(c, r + 1, c + 1, r + 1)
    for (r in 0 until rows) for (c in 0 until cols - 1) if (board.wallsV[r][c] == 1) seg(c + 1, r, c + 1, r + 1)
    fun isOpening(side: String, i: Int) =
        (board.entrance.side == side && board.entrance.index == i) || (board.exit.side == side && board.exit.index == i)
    for (c in 0 until cols) {
        if (!isOpening("top", c)) seg(c, 0, c + 1, 0)
        if (!isOpening("bottom", c)) seg(c, rows, c + 1, rows)
    }
    for (r in 0 until rows) {
        if (!isOpening("left", r)) seg(0, r, 0, r + 1)
        if (!isOpening("right", r)) seg(cols, r, cols, r + 1)
    }
    drawPath(walls, WALL, style = Stroke(maxOf(1.5f, cell * 0.12f), cap = StrokeCap.Square))

    drawOpeningMarker(board, board.entrance, cell, inward = true, color = if (playing) WALL else ENTRANCE_MARK)
    drawOpeningMarker(board, board.exit, cell, inward = false, color = if (playing) WALL else EXIT_MARK)
}

/** A ▼-style triangle just outside an opening, pointing in (entrance) or out (exit). */
private fun DrawScope.drawOpeningMarker(
    board: PicturesqueMazeEngine.Board,
    opening: PicturesqueMazeEngine.Opening,
    cell: Float,
    inward: Boolean,
    color: Color,
) {
    val s = cell * 0.32f
    val (cx, cy, inX, inY) = when (opening.side) {
        "top" -> listOf((opening.index + 0.5f) * cell, -cell * 0.45f, 0f, 1f)
        "bottom" -> listOf((opening.index + 0.5f) * cell, board.rows * cell + cell * 0.45f, 0f, -1f)
        "left" -> listOf(-cell * 0.45f, (opening.index + 0.5f) * cell, 1f, 0f)
        else -> listOf(board.cols * cell + cell * 0.45f, (opening.index + 0.5f) * cell, -1f, 0f)
    }
    val dx = if (inward) inX else -inX
    val dy = if (inward) inY else -inY
    val tri = Path().apply {
        moveTo(cx + dx * s, cy + dy * s)
        lineTo(cx - dx * s - dy * s, cy - dy * s - dx * s)
        lineTo(cx - dx * s + dy * s, cy - dy * s + dx * s)
        close()
    }
    drawPath(tri, color)
}
