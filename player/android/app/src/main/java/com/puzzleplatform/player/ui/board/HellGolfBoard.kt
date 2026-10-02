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
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HellGolfEngine
import kotlin.math.hypot

private val GRID_BG = Color.White
private val BORDER = Color(0xFF222222)
private val GRID_LINE = Color(0xFFBBBBBB)
private val LAKE_FILL = Color(0xFF9CA3AF)
private val LAKE_BORDER = Color(0xFF4B5563)
private val GOAL_TEXT = Color(0xFF374151)
private val GOAL_DONE = Color(0xFF16A34A)
private val LANDING = Color(0xFF22C55E)

/** Distinct color per ball so overlapping trails stay legible (mirrors the web board). */
private val BALL_COLORS = listOf(
    Color(0xFF2563EB), Color(0xFFDC2626), Color(0xFF16A34A), Color(0xFF9333EA), Color(0xFFEA580C),
    Color(0xFF0891B2), Color(0xFFDB2777), Color(0xFFCA8A04), Color(0xFF4F46E5), Color(0xFF0D9488),
    Color(0xFFBE123C), Color(0xFF65A30D), Color(0xFF7C3AED), Color(0xFFC2410C), Color(0xFF0369A1),
)

/**
 * Compose Canvas renderer for Hell Golf (puzzle type 19), the analog of
 * frontend/src/components/HellGolfBoard.tsx.
 *
 * Unlike the digit boards there's no DigitBar and no drag drawing: the player taps a
 * ball to select it (its legal landing cells highlight as dashed rings), taps a ring
 * to commit that move (a colored arrow is drawn and the ball's number drops by one),
 * and taps the ball's previous stop to retract the last move. Tapping the selected
 * ball again, or an empty cell, deselects. Selection is transient board state; only
 * committed moves ride in userValues (keyed "t:<ball>:<step>", via [onPutValue]).
 *
 * Rendering + tap hit-testing run through [ZoomableBoard]: one finger taps, two
 * fingers pan/pinch-zoom, so large boards stay legible on a phone. The tap handler
 * reads [userValues]/selection through [rememberUpdatedState] so the gesture closure
 * (captured once by [ZoomableBoard]'s pointerInput) always sees the freshest state.
 */
@Composable
fun HellGolfBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onPutValue: (key: String, value: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val canon = remember(puzzle.id) { HellGolfEngine.parseCanon(puzzle) }
    val rows = canon.rows
    val cols = canon.cols
    if (rows == 0 || cols == 0) return

    // Transient selection, owned by the board (not persisted). Reset per puzzle.
    var selected by remember(puzzle.id) { mutableStateOf<Int?>(null) }
    // Freshest state for the once-captured tap closure (see ZoomableBoard docs).
    val valuesState = rememberUpdatedState(userValues)
    val onPut = rememberUpdatedState(onPutValue)

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { col, row ->
            val cell = HellGolfEngine.Cell(row, col)
            val values = valuesState.value
            val trails = HellGolfEngine.trailsFrom(canon, values)
            val sel = selected

            var handled = false
            if (sel != null) {
                // Tap a highlighted landing cell -> commit that move.
                val landing = HellGolfEngine.reachable(canon, trails, sel)
                    .firstOrNull { it.r == cell.r && it.c == cell.c }
                if (landing != null) {
                    val step = trails[sel].size // origin is step 0; next stop = current size
                    onPut.value(HellGolfEngine.stepKey(sel, step), HellGolfEngine.encode(landing.r, landing.c, cols))
                    handled = true
                } else {
                    // Tap the previous stop of the selected trail -> retract the last move.
                    val path = trails[sel]
                    if (path.size > 1) {
                        val prev = path[path.size - 2]
                        if (prev.r == cell.r && prev.c == cell.c) {
                            onPut.value(HellGolfEngine.stepKey(sel, path.size - 1), 0)
                            handled = true
                        }
                    }
                }
            }

            if (!handled) {
                // (Re)select whichever ball sits under the tap; tapping it again clears.
                val idx = HellGolfEngine.ballAtHead(canon, trails, cell)
                selected = if (idx != null && idx == sel) null else idx
            }
        },
    ) { cell ->
        val values = valuesState.value
        val trails = HellGolfEngine.trailsFrom(canon, values)
        val sel = selected
        val boardW = cols * cell
        val boardH = rows * cell

        drawRect(GRID_BG, topLeft = Offset(0f, 0f), size = Size(boardW, boardH))

        // Lake cells.
        for (r in 0 until rows) {
            for (c in 0 until canon.lakes[r].size) {
                if (canon.lakes[r][c] == 1) {
                    drawRect(LAKE_FILL, topLeft = Offset(c * cell, r * cell), size = Size(cell, cell))
                }
            }
        }

        // Inner grid lines (dashed, light) + outer border.
        val dash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.11f, cell * 0.08f))
        for (r in 1 until rows) {
            val y = r * cell
            drawLine(GRID_LINE, Offset(0f, y), Offset(boardW, y), cell * 0.02f, pathEffect = dash)
        }
        for (c in 1 until cols) {
            val x = c * cell
            drawLine(GRID_LINE, Offset(x, 0f), Offset(x, boardH), cell * 0.02f, pathEffect = dash)
        }
        drawRect(BORDER, topLeft = Offset(0f, 0f), size = Size(boardW, boardH), style = Stroke(width = cell * 0.045f))

        // Thick borders around lake regions (an edge wherever the neighbor isn't a lake).
        val lakeStroke = cell * 0.07f
        for (r in 0 until rows) {
            for (c in 0 until canon.lakes[r].size) {
                if (canon.lakes[r][c] != 1) continue
                val x = c * cell
                val y = r * cell
                if (!canon.isLake(r - 1, c)) drawLine(LAKE_BORDER, Offset(x, y), Offset(x + cell, y), lakeStroke)
                if (!canon.isLake(r + 1, c)) drawLine(LAKE_BORDER, Offset(x, y + cell), Offset(x + cell, y + cell), lakeStroke)
                if (!canon.isLake(r, c - 1)) drawLine(LAKE_BORDER, Offset(x, y), Offset(x, y + cell), lakeStroke)
                if (!canon.isLake(r, c + 1)) drawLine(LAKE_BORDER, Offset(x + cell, y), Offset(x + cell, y + cell), lakeStroke)
            }
        }

        // Trails: a colored arrow per committed segment.
        for (i in trails.indices) {
            val color = BALL_COLORS[i % BALL_COLORS.size]
            val path = trails[i]
            for (si in 1 until path.size) {
                val from = path[si - 1]
                val to = path[si]
                drawArrow(
                    from = Offset((from.c + 0.5f) * cell, (from.r + 0.5f) * cell),
                    to = Offset((to.c + 0.5f) * cell, (to.r + 0.5f) * cell),
                    color = color,
                    cell = cell,
                )
            }
        }

        // Goals: an 'H' glyph, green when a ball currently rests on it.
        val goalTextSize = cell * 0.55f
        for (g in canon.goals) {
            val filled = trails.any { it.last().r == g.r && it.last().c == g.c }
            drawCenteredText(
                "H",
                (g.c + 0.5f) * cell,
                (g.r + 0.5f) * cell,
                goalTextSize,
                if (filled) GOAL_DONE else GOAL_TEXT,
                bold = true,
            )
        }

        // Reachable landing markers for the selected ball (dashed rings).
        if (sel != null) {
            val ringDash = PathEffect.dashPathEffect(floatArrayOf(cell * 0.09f, cell * 0.07f))
            for (l in HellGolfEngine.reachable(canon, trails, sel)) {
                drawCircle(
                    LANDING,
                    radius = cell * 0.3f,
                    center = Offset((l.c + 0.5f) * cell, (l.r + 0.5f) * cell),
                    style = Stroke(width = cell * 0.06f, pathEffect = ringDash),
                )
            }
        }

        // Balls at their current head positions.
        val ballRadius = cell * 0.34f
        val numTextSize = cell * 0.4f
        for (i in canon.balls.indices) {
            val h = HellGolfEngine.headOf(trails, i)
            val center = Offset((h.c + 0.5f) * cell, (h.r + 0.5f) * cell)
            val color = BALL_COLORS[i % BALL_COLORS.size]
            val done = HellGolfEngine.endedOn(canon, trails, i)
            val num = HellGolfEngine.currentNumber(canon, trails, i)
            drawCircle(GRID_BG, radius = ballRadius, center = center)
            drawCircle(
                color,
                radius = ballRadius,
                center = center,
                style = Stroke(width = cell * (if (sel == i) 0.09f else 0.055f)),
            )
            drawCenteredText(
                if (done) "✓" else num.toString(),
                center.x,
                center.y,
                numTextSize,
                if (done) GOAL_DONE else color,
                bold = true,
            )
        }
    }
}

/** Draw a colored arrow (shaft + filled head) from [from] to [to]. Segments are axis-aligned. */
private fun DrawScope.drawArrow(from: Offset, to: Offset, color: Color, cell: Float) {
    val dx = to.x - from.x
    val dy = to.y - from.y
    val len = hypot(dx, dy)
    if (len < 1f) return
    val ux = dx / len
    val uy = dy / len

    drawLine(color, from, to, strokeWidth = cell * 0.08f, cap = StrokeCap.Round)

    val headLen = cell * 0.3f
    val halfW = cell * 0.16f
    val baseX = to.x - ux * headLen
    val baseY = to.y - uy * headLen
    // Perpendicular to the direction, for the two base corners.
    val px = -uy
    val py = ux
    val head = Path().apply {
        moveTo(to.x, to.y)
        lineTo(baseX + px * halfW, baseY + py * halfW)
        lineTo(baseX - px * halfW, baseY - py * halfW)
        close()
    }
    drawPath(head, color)
}

/** Draw text centered at (cx, cy). */
private fun DrawScope.drawCenteredText(
    text: String,
    cx: Float,
    cy: Float,
    textSize: Float,
    color: Color,
    bold: Boolean,
) {
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
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2, paint)
}
