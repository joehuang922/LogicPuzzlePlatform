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
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HeyawakeEngine

private val GRID_BG = Color.White
private val LINE_THIN = Color(0xFFBBBBBB)
private val LINE_THICK = Color.Black
private val MARK_COLOR = Color(0xFF444444)
private val CLUE_COLOR = Color.Black
private val SELECT_FILL = Color(0xFFE0E8FF)

/**
 * Compose Canvas renderer for Heyawake (puzzle type 21), the analog of
 * frontend/src/components/HeyawakeBoard.tsx.
 *
 * The grid is tiled by rectangular rooms drawn with thick borders (wherever two cells sit in
 * different rooms); a clued room shows its number in its top-left cell. Input is the shared
 * shade/mark tap-to-cycle ([com.puzzleplatform.player.puzzle.ShadeCycle]): each tap advances
 * a cell empty -> shaded -> marked -> empty, applied by the caller via [onTapCell]. Shaded
 * cells render as [BoardColors.ROOM_SHADE] so the room borders stay visible, with the clue
 * staying black on top; marked cells draw a centered dot. Two fingers pan/zoom via
 * [ZoomableBoard].
 *
 * The Admin review editor passes [selectedCell] ("col,row") to highlight the cell its
 * [onTapCell] selected.
 */
@Composable
fun HeyawakeBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
    selectedCell: String? = null,
) {
    // Keyed on the canon too: the Admin review editor changes it under a stable id.
    val board = remember(puzzle.id, puzzle.canonRepr) { HeyawakeEngine.parseBoard(puzzle) }
    val roomIds = remember(puzzle.id, puzzle.canonRepr) { HeyawakeEngine.computeRoomIds(board) }
    val rows = board.height
    val cols = board.width
    if (rows <= 0 || cols <= 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values through state.
    val valuesState = rememberUpdatedState(userValues)
    val onTap = rememberUpdatedState(onTapCell)
    val selectedState = rememberUpdatedState(selectedCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
    ) { cell ->
        val boardW = cols * cell
        val boardH = rows * cell
        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))
        selectedState.value?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { (c, r) ->
            drawRect(SELECT_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
        }

        // Cell contents: shaded fill or a centered mark dot.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (valuesState.value[HeyawakeEngine.cellKey(c, r)] ?: HeyawakeEngine.UNSET) {
                    HeyawakeEngine.SHADED -> drawRect(
                        BoardColors.ROOM_SHADE,
                        topLeft = Offset(c * cell, r * cell),
                        size = Size(cell, cell),
                    )
                    HeyawakeEngine.MARKED -> drawCircle(
                        MARK_COLOR,
                        radius = cell * 0.12f,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                    )
                }
            }
        }

        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()

        // Horizontal lines: line index r (y = r*cell), one segment per column. Thick on the
        // outer border or where the cells above and below sit in different rooms.
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            for (c in 0 until cols) {
                val isThick = isBorder || roomIds[r - 1][c] != roomIds[r][c]
                drawLine(
                    if (isThick) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset((c + 1) * cell, r * cell),
                    strokeWidth = if (isThick) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
        }
        // Vertical lines: line index c (x = c*cell), one segment per row. Thick on the outer
        // border or where the cells left and right sit in different rooms.
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            for (r in 0 until rows) {
                val isThick = isBorder || roomIds[r][c - 1] != roomIds[r][c]
                drawLine(
                    if (isThick) LINE_THICK else LINE_THIN,
                    Offset(c * cell, r * cell),
                    Offset(c * cell, (r + 1) * cell),
                    strokeWidth = if (isThick) thick else thin,
                    cap = StrokeCap.Square,
                )
            }
        }

        // Clues in each clued room's top-left cell, black even on a shaded cell.
        for (room in board.rooms) {
            val clue = room.clue ?: continue
            if (room.r !in 0 until rows || room.c !in 0 until cols) continue
            drawClue(clue, room.c, room.r, cell)
        }
    }
}

/** Draw a (possibly multi-digit) clue centered in cell (col, row). */
private fun DrawScope.drawClue(value: Int, col: Int, row: Int, cell: Float) {
    val digits = value.toString().length
    val textSize = cell * when {
        digits <= 1 -> 0.5f
        digits == 2 -> 0.4f
        else -> 0.3f
    }
    val paint = android.graphics.Paint().apply {
        this.color = CLUE_COLOR.toArgb()
        this.textSize = textSize
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
