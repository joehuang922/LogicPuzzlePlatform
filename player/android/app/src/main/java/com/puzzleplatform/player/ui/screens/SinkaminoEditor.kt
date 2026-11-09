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
import com.puzzleplatform.player.puzzle.SinkaminoAuthoring
import com.puzzleplatform.player.puzzle.SinkaminoGrid
import com.puzzleplatform.player.ui.board.SinkaminoBoard

/**
 * Review body for a parsed sinkamino, the Android analog of the web SinkaminoEditor: the
 * draft on the player board, any problems, and two modes —
 *  - Cells: a tap cycles the cell white -> black -> given square -> white;
 *  - Arrows: a one-finger drag from tail to head draws a trail (dragging back over the
 *    previous cell undoes a step); a tap on a trail deletes it.
 * Two fingers still pan and zoom. Rows and columns are added or removed at the
 * bottom/right edge. Every edit goes straight to [onChange].
 *
 * Trails the canon can't hold (over a black cell, cut by a removed row) are format
 * problems: listed, and a block on creating the question until fixed.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SinkaminoEditor(
    draft: SinkaminoGrid,
    onChange: ((SinkaminoGrid) -> SinkaminoGrid) -> Unit,
) {
    var arrowMode by remember { mutableStateOf(false) }
    // The trail being dragged, (row, col) from tail.
    var drawing by remember { mutableStateOf<List<Pair<Int, Int>>>(emptyList()) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.arrows.size} arrows",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (SinkaminoAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — arrows must step between neighbours and avoid black cells:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in SinkaminoAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = !arrowMode, onClick = { arrowMode = false }, label = { Text("Cells") })
            FilterChip(selected = arrowMode, onClick = { arrowMode = true }, label = { Text("Arrows") })
        }

        if (draft.rows > 0 && draft.cols > 0) {
            SinkaminoBoard(
                puzzle = SinkaminoAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { col, row ->
                    if (arrowMode) onChange { SinkaminoAuthoring.removeArrowAt(it, col, row) }
                    else onChange { SinkaminoAuthoring.cycleCell(it, col, row) }
                },
                draftTrail = drawing,
                // ZoomableBoard reports cells as (col, row); trails are (row, col).
                onDrawStart = if (!arrowMode) null else { cell ->
                    drawing = cell?.let { (c, r) -> listOf(r to c) } ?: emptyList()
                },
                onDrawTo = if (!arrowMode) null else { cell ->
                    if (cell != null && drawing.isNotEmpty()) {
                        drawing = SinkaminoAuthoring.extendTrail(drawing, cell.second to cell.first)
                    }
                },
                onDrawEnd = if (!arrowMode) null else {
                    {
                        val trail = drawing
                        drawing = emptyList()
                        onChange { SinkaminoAuthoring.addArrow(it, trail) }
                    }
                },
            )
        }
        Text(
            if (arrowMode) "Drag from an arrow's tail to its head to draw it; tap an arrow to delete it."
            else "Tap a cell to cycle it: white → black → given square → white.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(SinkaminoAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(SinkaminoAuthoring::removeLastRow) }, enabled = draft.rows > 1) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(SinkaminoAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(SinkaminoAuthoring::removeLastCol) }, enabled = draft.cols > 1) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
