package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine.Dot
import kotlin.math.hypot
import kotlin.math.roundToInt

private val GRAY_FILL = Color(0xFF8C8C8C)
private val LINE = Color(0xFF222222)
private val ERROR = Color(0xFFD32F2F)
private val CLUE_OUTLINE = Color(0xFF111111)

// A dragged finger joins a dot within this fraction of the spacing; a knight-move drag
// passes 0.45 from the dots it skips, so it can't catch them.
private const val CAPTURE = 0.3f
// A tap this close (fraction of spacing) to a segment erases it.
private const val TAP_HIT = 0.25f

/** Drag-to-draw state: the last dot the finger joined and whether this stroke draws or erases. */
private class KnightDragState {
    var last: Dot? = null
    var draw: Boolean? = null
}

/**
 * Compose Canvas renderer for Whimsical Knight (puzzle type 37), the analog of
 * frontend/src/components/WhimsicalKnightBoard.tsx.
 *
 * The lattice is drawn one dot per [ZoomableBoard] cell, at the cell's centre, so the
 * board's cells are dots and a gray square sits between four dot centres. A one-finger
 * drag from dot to dot toggles the segment between them (orthogonal or a knight's move);
 * the stroke's first segment decides draw vs erase. A tap on a segment erases it. Every
 * change goes out through [onApplyChanges] (0 drops the key). With [liveValidate] on,
 * crossing segments and knight segments over gray are red, and a broken circle or
 * square is outlined red.
 *
 * The Admin review editor passes [onEditTap]: a tap then reports its fractional dot
 * coordinates (x = column, y = row; dot (r, c) at (c, r)) for toggling a gray square or
 * cycling a clue, and dragging draws nothing.
 */
@Composable
fun WhimsicalKnightBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
    onEditTap: ((x: Float, y: Float) -> Unit)? = null,
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { WhimsicalKnightEngine.parseBoard(puzzle) }
    val rows = board.rows
    val cols = board.cols
    if (rows < 2 || cols < 2) return

    val valuesState = rememberUpdatedState(userValues)
    val onApply = rememberUpdatedState(onApplyChanges)
    val drag = remember(puzzle.id) { KnightDragState() }
    val onEdit = rememberUpdatedState(onEditTap)
    val editing = onEditTap != null
    val segs = remember(board, userValues) { WhimsicalKnightEngine.segments(board, userValues) }
    val bad = remember(board, segs, liveValidate) {
        if (liveValidate) WhimsicalKnightEngine.badSegments(board, segs) else emptySet()
    }
    val brokenClues = remember(board, segs, liveValidate) {
        if (!liveValidate) emptySet() else board.clues.indices.filter { i ->
            val (isCircle, p) = board.clues[i]
            WhimsicalKnightEngine.clueBroken(isCircle, p, segs)
        }.toSet()
    }

    // Fractional cell coordinates -> dot coordinates: dot (r, c) sits at cell centre (c + 0.5, r + 0.5).
    fun dotNear(col: Float, row: Float): Dot? {
        val x = col - 0.5f
        val y = row - 0.5f
        val c = x.roundToInt()
        val r = y.roundToInt()
        if (r !in 0 until rows || c !in 0 until cols) return null
        return if (hypot(x - c, y - r) <= CAPTURE) Dot(r, c) else null
    }

    fun dragTo(col: Float, row: Float) {
        val dot = dotNear(col, row) ?: return
        val last = drag.last
        if (last == dot) return
        drag.last = dot
        if (last == null || !WhimsicalKnightEngine.isStep(last, dot)) return
        val key = WhimsicalKnightEngine.key(WhimsicalKnightEngine.segment(last, dot))
        val on = valuesState.value[key] == 1
        val draw = drag.draw ?: (!on).also { drag.draw = it }
        if (on != draw) onApply.value(mapOf(key to if (draw) 1 else 0))
    }

    fun tapAt(col: Float, row: Float) {
        val x = col - 0.5f
        val y = row - 0.5f
        val hit = WhimsicalKnightEngine.segments(board, valuesState.value).minByOrNull { s ->
            val ax = s.a.c.toFloat(); val ay = s.a.r.toFloat()
            val dx = s.b.c - ax; val dy = s.b.r - ay
            val t = (((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)).coerceIn(0f, 1f)
            hypot(x - (ax + t * dx), y - (ay + t * dy))
        } ?: return
        val ax = hit.a.c.toFloat(); val ay = hit.a.r.toFloat()
        val dx = hit.b.c - ax; val dy = hit.b.r - ay
        val t = (((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)).coerceIn(0f, 1f)
        if (hypot(x - (ax + t * dx), y - (ay + t * dy)) <= TAP_HIT) {
            onApply.value(mapOf(WhimsicalKnightEngine.key(hit) to 0))
        }
    }

    ZoomableBoard(
        cols = cols,
        rows = rows,
        resetKey = puzzle.id,
        modifier = modifier,
        onTapCell = { _, _ -> },
        onTapPrecise = { col, row ->
            val edit = onEdit.value
            if (edit != null) edit(col - 0.5f, row - 0.5f) else tapAt(col, row)
        },
        onDrawStartPrecise = if (editing) null else { col, row ->
            drag.last = dotNear(col, row)
            drag.draw = null
        },
        onDrawToPrecise = if (editing) null else { col, row -> dragTo(col, row) },
        onDrawEnd = if (editing) null else {
            {
                drag.last = null
                drag.draw = null
            }
        },
    ) { cell ->
        fun at(dr: Int, dc: Int) = Offset((dc / 2f + 0.5f) * cell, (dr / 2f + 0.5f) * cell)
        drawRect(Color.White, Offset.Zero, Size(cols * cell, rows * cell))

        val inset = cell * 0.1f
        for (r in 0 until rows - 1) {
            for (c in 0 until cols - 1) {
                if (!board.isGray(r, c)) continue
                drawRect(
                    GRAY_FILL,
                    Offset((c + 0.5f) * cell + inset, (r + 0.5f) * cell + inset),
                    Size(cell - 2 * inset, cell - 2 * inset),
                )
            }
        }

        val outline = 1.5.dp.toPx()
        val errorOutline = 2.5.dp.toPx()
        board.clues.forEachIndexed { i, (isCircle, p) ->
            val center = at(p.dr, p.dc)
            val stroke = Stroke(width = if (i in brokenClues) errorOutline else outline)
            val color = if (i in brokenClues) ERROR else CLUE_OUTLINE
            if (isCircle) {
                drawCircle(Color.White, cell * 0.22f, center)
                drawCircle(color, cell * 0.22f, center, style = stroke)
            } else {
                val half = cell * 0.22f
                val topLeft = Offset(center.x - half, center.y - half)
                drawRect(Color.White, topLeft, Size(2 * half, 2 * half))
                drawRect(color, topLeft, Size(2 * half, 2 * half), style = stroke)
            }
        }

        segs.forEachIndexed { i, s ->
            drawLine(
                if (i in bad) ERROR else LINE,
                at(2 * s.a.r, 2 * s.a.c),
                at(2 * s.b.r, 2 * s.b.c),
                strokeWidth = 3.dp.toPx(),
                cap = StrokeCap.Round,
            )
        }

        for (r in 0 until rows) {
            for (c in 0 until cols) drawCircle(Color(0xFF111111), cell * 0.07f, at(2 * r, 2 * c))
        }
    }
}
