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
import com.puzzleplatform.player.puzzle.RippleEffectAuthoring
import com.puzzleplatform.player.puzzle.RippleEffectDraft
import com.puzzleplatform.player.puzzle.WallSide
import com.puzzleplatform.player.ui.board.RippleEffectDraftBoard

/**
 * Review body for a parsed ripple effect, the Android analog of the web
 * RippleEffectEditor: the draft's walls on [RippleEffectDraftBoard] (tap a cell to select
 * it), any problems, and a panel for the selected cell — type its given number (blank for
 * none), toggle the wall on each side, or delete its row/column (a parser's phantom
 * line). Add row/column append a one-room line for one the parser missed. Every edit
 * goes straight to [onChange]; [selectedCell] is "col,row".
 *
 * Walls toggle one cell side at a time with no checks. A wall left ending inside a room
 * is a format problem: listed (and tinted on the board) and a block on creating the
 * question until it's fixed.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RippleEffectRoomEditor(
    draft: RippleEffectDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((RippleEffectDraft) -> RippleEffectDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)?.takeIf { it < draft.width }
    val selRow = selected?.get(1)?.takeIf { it < draft.height }
    val formatProblems = RippleEffectAuthoring.formatProblems(draft)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.height} rows × ${draft.width} columns, ${draft.regions().size} rooms",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (formatProblems.isNotEmpty()) {
            Text(
                "Fix before creating — every wall must close off a room:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in RippleEffectAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.width > 0 && draft.height > 0) {
            RippleEffectDraftBoard(
                draft = draft,
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell = selectedCell?.takeIf { selCol != null && selRow != null },
            )
        }

        if (selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit its number or walls.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            // One panel per cell: a new selection builds it afresh, so its wall chips read
            // and toggle the newly selected cell, never the one picked before.
            key(selCol, selRow) {
                SelectedCellPanel(draft, selCol, selRow, onSelectCell, onChange)
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(RippleEffectAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(RippleEffectAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}

/**
 * The selected cell's number, wall chips, and delete row/column buttons. [col] and
 * [row] are fixed for this panel's lifetime; [RippleEffectRoomEditor] keys it per cell.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SelectedCellPanel(
    draft: RippleEffectDraft,
    col: Int,
    row: Int,
    onSelectCell: (String?) -> Unit,
    onChange: ((RippleEffectDraft) -> RippleEffectDraft) -> Unit,
) {
    Text("Row ${row + 1}, column ${col + 1}", fontWeight = FontWeight.Medium)
    val roomSize = draft.regionAt(col, row)?.size ?: 0
    val clue = draft.clues[row to col]
    ClueNumberField(
        label = "Number (room of $roomSize, blank for none)",
        clue = clue,
        parse = RippleEffectAuthoring::parseClue,
        onClue = { v -> onChange { RippleEffectAuthoring.setClue(it, col, row, v) } },
        isError = (clue ?: 0) > roomSize,
        modifier = Modifier.fillMaxWidth(),
    )
    Text("Walls", style = MaterialTheme.typography.bodySmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for ((side, label) in WALL_LABELS) {
            FilterChip(
                selected = RippleEffectAuthoring.hasWall(draft, col, row, side),
                onClick = { onChange { RippleEffectAuthoring.toggleWall(it, col, row, side) } },
                enabled = RippleEffectAuthoring.canToggleWall(draft, col, row, side),
                label = { Text(label) },
            )
        }
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedButton(
            onClick = {
                onSelectCell(null)
                onChange { RippleEffectAuthoring.removeRow(it, row) }
            },
            enabled = draft.height > 1,
        ) { Text("Delete row ${row + 1}") }
        OutlinedButton(
            onClick = {
                onSelectCell(null)
                onChange { RippleEffectAuthoring.removeCol(it, col) }
            },
            enabled = draft.width > 1,
        ) { Text("Delete column ${col + 1}") }
    }
}

private val WALL_LABELS = listOf(
    WallSide.TOP to "Top",
    WallSide.BOTTOM to "Bottom",
    WallSide.LEFT to "Left",
    WallSide.RIGHT to "Right",
)
