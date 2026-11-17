package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.KuralinEngine
import com.puzzleplatform.player.puzzle.ZebraRopeAuthoring
import com.puzzleplatform.player.puzzle.ZebraRopeEngine
import com.puzzleplatform.player.ui.board.ZebraRopeBoard
import kotlin.math.floor
import kotlin.math.hypot

// A dragged finger joins a cell within this distance (in cells) of its centre, so a
// diagonal drag across a corner picks the diagonal neighbour (web editor parity).
private const val CAPTURE_RADIUS = 0.35f

/**
 * Review body for a parsed zebra rope, the Android analog of the web ZebraRopeEditor: the
 * draft on the player board, any problems, and two modes —
 *  - Circles: a tap on a grid line or corner cycles its circle none -> white -> gray ->
 *    black -> none;
 *  - Ropes: a one-finger drag through cells draws a rope (8-neighbour steps; dragging
 *    back over the previous cell undoes a step); a tap on a rope deletes it.
 * Two fingers still pan and zoom. Rows and columns are added or removed at the
 * bottom/right edge. Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ZebraRopeEditor(
    draft: ZebraRopeEngine.Board,
    onChange: ((ZebraRopeEngine.Board) -> ZebraRopeEngine.Board) -> Unit,
) {
    var ropeMode by remember { mutableStateOf(false) }
    // The rope being dragged, (row, col) in order.
    var drawing by remember { mutableStateOf<List<Pair<Int, Int>>>(emptyList()) }

    // Fractional cell coordinates -> the cell whose centre is within reach, as (row, col).
    fun cellNear(col: Float, row: Float): Pair<Int, Int>? {
        val c = floor(col).toInt()
        val r = floor(row).toInt()
        if (r !in 0 until draft.rows || c !in 0 until draft.cols) return null
        return if (hypot(col - (c + 0.5f), row - (r + 0.5f)) <= CAPTURE_RADIUS) r to c else null
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.ropes.size} ropes, ${draft.circles.size} circles",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (ZebraRopeAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — ropes must step between neighbours, circles sit on grid lines:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in ZebraRopeAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = !ropeMode, onClick = { ropeMode = false }, label = { Text("Circles") })
            FilterChip(selected = ropeMode, onClick = { ropeMode = true }, label = { Text("Ropes") })
        }

        if (draft.rows > 0 && draft.cols > 0) {
            ZebraRopeBoard(
                puzzle = ZebraRopeAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onTapPoint = { col, row ->
                    if (ropeMode) {
                        val r = floor(row).toInt()
                        val c = floor(col).toInt()
                        onChange { ZebraRopeAuthoring.removeRopeAt(it, r, c) }
                    } else {
                        KuralinEngine.nearestPoint(col, row, draft.rows, draft.cols)?.let { (dr, dc) ->
                            onChange { ZebraRopeAuthoring.cycleCircle(it, dr, dc) }
                        }
                    }
                },
                onDrawStartPrecise = if (!ropeMode) null else { col, row ->
                    drawing = cellNear(col, row)?.let { listOf(it) } ?: emptyList()
                },
                onDrawToPrecise = if (!ropeMode) null else { col, row ->
                    cellNear(col, row)?.let { cell ->
                        drawing = if (drawing.isEmpty()) listOf(cell) else ZebraRopeAuthoring.extendRope(drawing, cell)
                    }
                },
                onDrawEnd = if (!ropeMode) null else {
                    {
                        val rope = drawing
                        drawing = emptyList()
                        onChange { ZebraRopeAuthoring.addRope(it, rope) }
                    }
                },
                draftRope = drawing,
            )
        }
        Text(
            if (ropeMode) "Drag through cells to draw a rope (diagonal steps too); tap a rope to delete it."
            else "Tap a grid line or corner to cycle its circle: white → gray → black → none.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(ZebraRopeAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(ZebraRopeAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(ZebraRopeAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(ZebraRopeAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
