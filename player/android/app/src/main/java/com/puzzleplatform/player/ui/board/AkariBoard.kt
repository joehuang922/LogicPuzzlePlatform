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
import com.puzzleplatform.player.puzzle.AkariEngine

// Colors match the web board (AkariBoard.tsx).
private val WALL_FILL = Color(0xFF222222)
private val WALL_NUMBER = Color.White
private val WHITE_BG = Color.White
private val LIT_BG = Color(0xFFFFF6C2)
private val BULB_FILL = Color(0xFFF5B301)
private val BULB_STROKE = Color(0xFF8A6400)
private val CONFLICT_FILL = Color(0xFFE02424)
private val CONFLICT_STROKE = Color(0xFF7A0000)
private val MARK_COLOR = Color(0xFF888888)
private val LINE = Color(0xFF333333)

/**
 * Compose Canvas renderer for Akari / Light Up (puzzle type 18), the analog of
 * frontend/src/components/AkariBoard.tsx.
 *
 * Black walls (with an optional 0..4 number) and white cells. Lit white cells take a
 * light-yellow tint, recomputed from the bulbs on every draw. Input is the shared
 * shade/mark tap-to-cycle ([com.puzzleplatform.player.puzzle.ShadeCycle]): each tap
 * advances a white cell empty -> bulb -> dot -> empty, applied by the caller via
 * [onTapCell]; walls ignore taps. With [liveValidate] on, bulbs that light each other
 * turn red. Two fingers pan/zoom via [ZoomableBoard].
 */
@Composable
fun AkariBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    onTapCell: (col: Int, row: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = remember(puzzle.id) { AkariEngine.parseCells(puzzle) }
    val rows = cells.size
    val cols = cells.maxOfOrNull { it.size } ?: 0
    if (rows == 0 || cols == 0) return

    // The tap closure outlives a recomposition (ZoomableBoard's pointerInput doesn't
    // restart when these change), so read the freshest values/callback through state.
    val valuesState = rememberUpdatedState(userValues)
    val validateState = rememberUpdatedState(liveValidate)
    val onTap = rememberUpdatedState(onTapCell)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row -> onTap.value(col, row) },
    ) { cell ->
        val values = valuesState.value
        val illumination = AkariEngine.illuminate(cells, values)
        val boardW = cols * cell
        val boardH = rows * cell

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val topLeft = Offset(c * cell, r * cell)
                if (AkariEngine.isWall(cells, r, c)) {
                    drawRect(WALL_FILL, topLeft = topLeft, size = Size(cell, cell))
                    val clue = cells[r].getOrNull(c) ?: continue
                    if (clue in 0..4) drawWallNumber(clue, c, r, cell)
                    continue
                }
                drawRect(
                    if (illumination.lit[r][c]) LIT_BG else WHITE_BG,
                    topLeft = topLeft,
                    size = Size(cell, cell),
                )
                val center = Offset(c * cell + cell / 2, r * cell + cell / 2)
                when (values[AkariEngine.cellKey(c, r)] ?: AkariEngine.EMPTY) {
                    AkariEngine.BULB -> {
                        val conflict = validateState.value && illumination.conflict[r][c]
                        drawCircle(if (conflict) CONFLICT_FILL else BULB_FILL, radius = cell * 0.3f, center = center)
                        drawCircle(
                            if (conflict) CONFLICT_STROKE else BULB_STROKE,
                            radius = cell * 0.3f,
                            center = center,
                            style = Stroke(width = 1.5.dp.toPx()),
                        )
                    }
                    AkariEngine.MARKED -> drawCircle(MARK_COLOR, radius = cell * 0.1f, center = center)
                }
            }
        }

        // Solid gridlines: thin interior dividers, thick outer border.
        val thin = 1.dp.toPx()
        val thick = 3.dp.toPx()
        for (r in 0..rows) {
            val isBorder = r == 0 || r == rows
            drawLine(
                LINE,
                Offset(0f, r * cell),
                Offset(boardW, r * cell),
                strokeWidth = if (isBorder) thick else thin,
                cap = StrokeCap.Square,
            )
        }
        for (c in 0..cols) {
            val isBorder = c == 0 || c == cols
            drawLine(
                LINE,
                Offset(c * cell, 0f),
                Offset(c * cell, boardH),
                strokeWidth = if (isBorder) thick else thin,
                cap = StrokeCap.Square,
            )
        }
    }
}

/** Draw a wall's 0..4 number in white, centered in cell (col, row). */
private fun DrawScope.drawWallNumber(value: Int, col: Int, row: Int, cell: Float) {
    val paint = android.graphics.Paint().apply {
        this.color = WALL_NUMBER.toArgb()
        this.textSize = cell * 0.5f
        this.textAlign = android.graphics.Paint.Align.CENTER
        this.isAntiAlias = true
        this.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val cx = col * cell + cell / 2
    val fm = paint.fontMetrics
    val cy = row * cell + cell / 2 - (fm.ascent + fm.descent) / 2
    drawContext.canvas.nativeCanvas.drawText(value.toString(), cx, cy, paint)
}
