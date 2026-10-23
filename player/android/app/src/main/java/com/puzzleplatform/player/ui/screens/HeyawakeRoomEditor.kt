package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.HeyawakeAuthoring
import com.puzzleplatform.player.puzzle.HeyawakeDraft
import com.puzzleplatform.player.puzzle.WallSide
import com.puzzleplatform.player.ui.board.HeyawakeDraftBoard

/**
 * Review body for a parsed heyawake, the Android analog of the web HeyawakeEditor: the
 * draft's walls on [HeyawakeDraftBoard] (tap a cell to select it), any problems, and a
 * panel for the selected cell — type its room's clue (blank for none), toggle the wall
 * on each side, or delete its row/column (a parser's phantom line). Add row/column
 * append a one-room line for one the parser missed. Every edit goes straight to
 * [onChange]; [selectedCell] is "col,row".
 *
 * Walls toggle one cell side at a time with no checks, so a room can be L-shaped or
 * half-split on the way to the right layout. Those format problems are listed (and
 * tinted on the board) and block creating the question until they're fixed.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HeyawakeRoomEditor(
    draft: HeyawakeDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((HeyawakeDraft) -> HeyawakeDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val room = if (selCol != null && selRow != null) draft.regionAt(selCol, selRow) else null
    val formatProblems = HeyawakeAuthoring.formatProblems(draft)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.height} rows × ${draft.width} columns, ${draft.regions().size} rooms",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (formatProblems.isNotEmpty()) {
            Text(
                "Fix before creating — rooms must be rectangles with at most one clue:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in HeyawakeAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.width > 0 && draft.height > 0) {
            HeyawakeDraftBoard(
                draft = draft,
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell = selectedCell?.takeIf { selCol != null && selCol < draft.width && selRow != null && selRow < draft.height },
            )
        }

        if (selCol == null || selRow == null || selCol >= draft.width || selRow >= draft.height) {
            Text(
                "Tap a cell to edit its room.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            if (room != null) {
                val max = HeyawakeAuthoring.maxClue(room.w, room.h)
                val size = if (room.isRectangle) "${room.w}×${room.h}" else "${room.cells.size} cells, not a rectangle"
                // Re-key per room so each selection starts its field from that room's clue.
                key(room.cells.first()) {
                    ClueNumberField(
                        label = "Room clue ($size, blank for none)",
                        clue = room.clue,
                        parse = HeyawakeAuthoring::parseClue,
                        onClue = { v -> onChange { HeyawakeAuthoring.setClue(it, selCol, selRow, v) } },
                        isError = room.clueCells.size > 1 || (room.isRectangle && (room.clue ?: 0) > max),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Text("Walls", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((side, label) in WALL_LABELS) {
                    FilterChip(
                        selected = HeyawakeAuthoring.hasWall(draft, selCol, selRow, side),
                        onClick = { onChange { HeyawakeAuthoring.toggleWall(it, selCol, selRow, side) } },
                        enabled = HeyawakeAuthoring.canToggleWall(draft, selCol, selRow, side),
                        label = { Text(label) },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { HeyawakeAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.height > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { HeyawakeAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.width > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(HeyawakeAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(HeyawakeAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}

private val WALL_LABELS = listOf(
    WallSide.TOP to "Top",
    WallSide.BOTTOM to "Bottom",
    WallSide.LEFT to "Left",
    WallSide.RIGHT to "Right",
)
