package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.ClueGridDraft
import com.puzzleplatform.player.puzzle.HashiAuthoring
import com.puzzleplatform.player.puzzle.HashiRules
import com.puzzleplatform.player.ui.board.HashiBoard

/**
 * Review body for a parsed Hashi, the Android analog of the web HashiEditor: the board
 * (tap a lattice point to select it; empty points show as faint dots), any warnings, and
 * chips for the selected point — empty or an island 1-8; or delete its row/column (a
 * parser's phantom line). Add row/column append an empty line for one the parser missed.
 * Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HashiEditor(
    draft: ClueGridDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((ClueGridDraft) -> ClueGridDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = selCol != null && selRow != null && draft.inGrid(selCol, selRow)
    val value = if (inGrid && selCol != null && selRow != null) draft.cellAt(selCol, selRow) else null

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in HashiAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // No bridges are drawn here, so the drag's writes are dropped.
            HashiBoard(
                puzzle = HashiAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                liveValidate = false,
                onApplyChanges = {},
                showEmptyPoints = true,
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell = selectedCell?.takeIf { inGrid },
            )
        }

        if (value == null || selCol == null || selRow == null) {
            Text(
                "Tap a point to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = value == HashiRules.EMPTY,
                    onClick = { onChange { HashiAuthoring.setCell(it, selCol, selRow, HashiRules.EMPTY) } },
                    label = { Text("Empty") },
                )
                for (n in 1..HashiRules.MAX_CLUE) {
                    FilterChip(
                        selected = value == n,
                        onClick = { onChange { HashiAuthoring.setCell(it, selCol, selRow, n) } },
                        label = { Text("$n") },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { HashiAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { HashiAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(HashiAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(HashiAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
