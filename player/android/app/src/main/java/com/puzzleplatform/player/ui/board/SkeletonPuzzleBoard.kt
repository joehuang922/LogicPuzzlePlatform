package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.SkeletonPuzzleEngine
import com.puzzleplatform.player.puzzle.SkeletonRules

private val INK = Color(0xFF222222)
private val THIN = Color(0xFF888888)
private val SELECT_FILL = Color(0xFFDDE8FF)
private val NON_CELL_EDIT = Color(0xFFE4E4E4)
private val SLOT_LABEL = Color(0xFF99AABB)

/**
 * Skeleton Puzzle (puzzle type 35), the analog of
 * frontend/src/components/SkeletonPuzzleBoard.tsx. Tap a cell to select a slot through
 * it (across first; tap again to switch to down), then pick a word below the board: the
 * picker lists only unused words of the slot's length that agree with the kana already
 * there, so placements never clash. Each pick or Clear is one atomic [onApplyChanges]
 * ("p:<slot>" -> word index + 1, 0 to clear). The word list is grouped by length like the
 * print, with placed words struck. Two fingers pan/zoom via [ZoomableBoard].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SkeletonPuzzleBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val board = remember(puzzle.id, puzzle.canonRepr) { SkeletonPuzzleEngine.parse(puzzle) }
    val slots = remember(board) { SkeletonRules.findSlots(board.cells) }
    if (board.rows == 0 || board.cols == 0) return
    var selected by remember(puzzle.id) { mutableStateOf<Int?>(null) }
    val placed = SkeletonRules.placements(userValues, slots.size, board.words.size)
    val letters = SkeletonRules.grid(board, slots, placed)
    val slot = selected?.let { slots.getOrNull(it) }
    val selectedState = rememberUpdatedState(slot)
    val slotsState = rememberUpdatedState(slots)
    val lettersState = rememberUpdatedState(letters)

    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ZoomableBoard(
            cols = board.cols,
            rows = board.rows,
            resetKey = puzzle.id,
            onTapCell = { col, row ->
                val through = SkeletonRules.slotsAt(slotsState.value, row, col)
                if (through.isNotEmpty()) {
                    val at = through.indexOfFirst { it.index == selectedState.value?.index }
                    selected = through[if (at == -1) 0 else (at + 1) % through.size].index
                }
            },
        ) { cell ->
            drawSkeleton(board, lettersState.value, selectedState.value?.cells?.toSet() ?: emptySet(), cell)
        }

        if (slot == null) {
            Text(
                "Tap a cell to pick a word for its slot; tap again to switch across/down.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val holds = placed[slot.index]
            Text(
                "${slot.length} letters ${if (slot.dir == SkeletonRules.Dir.ACROSS) "across" else "down"} from " +
                    "R${slot.r + 1}C${slot.c + 1}" + (holds?.let { " · holds ${board.words[it].word}" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val picks = SkeletonRules.candidates(board, slots, placed, slot).filter { it != holds }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (i in picks) {
                    AssistChip(
                        onClick = { onApplyChanges(mapOf(SkeletonRules.slotKey(slot.index) to i + 1)) },
                        label = { Text(board.words[i].word, fontSize = 16.sp) },
                    )
                }
                if (holds != null) {
                    OutlinedButton(onClick = { onApplyChanges(mapOf(SkeletonRules.slotKey(slot.index) to 0)) }) {
                        Text("Clear", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            if (picks.isEmpty() && holds == null) {
                Text(
                    "No unused word fits here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        SkeletonWordList(board, placed.values.toSet())
    }
}

/** The word list grouped by length (3文字, 4文字, ...), struck where [used]. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SkeletonWordList(board: SkeletonRules.Board, used: Set<Int>) {
    val groups = board.words.indices.groupBy { board.words[it].word.length }.toSortedMap()
    FlowRow(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for ((len, indices) in groups) {
            Column(Modifier.widthIn(min = 110.dp)) {
                Text("${len}文字", fontWeight = FontWeight.Bold)
                HorizontalDivider()
                for (i in indices) {
                    val w = board.words[i]
                    val struck = i in used
                    Text(buildAnnotatedString {
                        withStyle(
                            SpanStyle(
                                textDecoration = if (struck) TextDecoration.LineThrough else TextDecoration.None,
                                color = if (struck) Color(0xFF999999) else Color.Unspecified,
                            ),
                        ) { append(w.word) }
                        if (!w.hint.isNullOrBlank()) {
                            withStyle(SpanStyle(fontSize = 11.sp, color = Color(0xFF888888))) { append(" (${w.hint})") }
                        }
                    })
                }
            }
        }
    }
}

/**
 * The board like the print: white cells with thin lines between them, a thick outline,
 * nothing in non-cells (grey with [editing]), kana from [letters], marks with an inner
 * frame and a corner label. [highlight] cells are tinted. [editing] also shows each
 * slot's length faintly at its start.
 */
internal fun DrawScope.drawSkeleton(
    board: SkeletonRules.Board,
    letters: List<List<String>>?,
    highlight: Set<Pair<Int, Int>>,
    cell: Float,
    editing: Boolean = false,
) {
    val cells = board.cells
    for (r in 0 until board.rows) for (c in 0 until board.cols) {
        val fill = when {
            (r to c) in highlight -> SELECT_FILL
            cells[r][c] == 1 -> Color.White
            editing -> NON_CELL_EDIT
            else -> null
        } ?: continue
        drawRect(fill, Offset(c * cell, r * cell), Size(cell, cell))
    }
    for (m in board.marks) {
        val inset = cell * 0.1f
        drawRect(
            INK, Offset(m.c * cell + inset, m.r * cell + inset), Size(cell - 2 * inset, cell - 2 * inset),
            style = androidx.compose.ui.graphics.drawscope.Stroke(cell * 0.03f),
        )
        drawText(m.label, Offset((m.c + 0.86f) * cell, (m.r + 0.92f) * cell), cell * 0.26f, INK)
    }
    // One line per edge: thin between two cells, thick on the outline.
    val thin = cell * 0.025f
    val thick = cell * 0.07f
    for (r in 0..board.rows) for (c in 0 until board.cols) {
        val above = SkeletonRules.isCell(cells, r - 1, c)
        val below = SkeletonRules.isCell(cells, r, c)
        if (!above && !below) continue
        val outline = above != below
        drawLine(if (outline) INK else THIN, Offset(c * cell, r * cell), Offset((c + 1) * cell, r * cell), if (outline) thick else thin)
    }
    for (r in 0 until board.rows) for (c in 0..board.cols) {
        val left = SkeletonRules.isCell(cells, r, c - 1)
        val right = SkeletonRules.isCell(cells, r, c)
        if (!left && !right) continue
        val outline = left != right
        drawLine(if (outline) INK else THIN, Offset(c * cell, r * cell), Offset(c * cell, (r + 1) * cell), if (outline) thick else thin)
    }
    if (letters != null) {
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            val ch = letters.getOrNull(r)?.getOrNull(c).orEmpty()
            if (ch.isNotEmpty()) drawText(ch, Offset((c + 0.5f) * cell, (r + 0.5f) * cell), cell * 0.6f, Color.Black, centre = true)
        }
    }
    if (editing) {
        for (s in SkeletonRules.findSlots(cells)) {
            val label = (if (s.dir == SkeletonRules.Dir.ACROSS) "→" else "↓") + s.length
            val at = if (s.dir == SkeletonRules.Dir.ACROSS) Offset(s.c * cell + cell * 0.22f, (s.r + 0.95f) * cell)
            else Offset((s.c + 0.78f) * cell, s.r * cell + cell * 0.3f)
            drawText(label, at, cell * 0.24f, SLOT_LABEL)
        }
    }
}

private fun DrawScope.drawText(text: String, at: Offset, size: Float, color: Color, centre: Boolean = false) {
    val paint = android.graphics.Paint().apply {
        this.color = color.toArgb()
        textSize = size
        textAlign = android.graphics.Paint.Align.CENTER
        isAntiAlias = true
    }
    val y = if (centre) at.y - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2 else at.y
    drawContext.canvas.nativeCanvas.drawText(text, at.x, y, paint)
}
