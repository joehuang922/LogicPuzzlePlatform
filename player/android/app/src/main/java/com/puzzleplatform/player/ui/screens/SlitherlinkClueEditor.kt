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
import com.puzzleplatform.player.puzzle.SlitherlinkAuthoring
import com.puzzleplatform.player.puzzle.SlitherlinkDraft
import com.puzzleplatform.player.ui.board.SlitherlinkBoard

/**
 * Review body for a parsed slitherlink, the Android analog of the web SlitherlinkEditor:
 * the clue grid on the player board (tap a cell to select it), any problems that can't
 * be right, and a panel for the selected cell — set its clue (blank or 0-3), or delete
 * its row/column (a parser's phantom line). Add row/column append a blank line for one
 * the parser missed. Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SlitherlinkClueEditor(
    draft: SlitherlinkDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((SlitherlinkDraft) -> SlitherlinkDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val clue = if (selCol != null && selRow != null) draft.cellAt(selCol, selRow) else null

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in SlitherlinkAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            SlitherlinkBoard(
                puzzle = SlitherlinkAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onCycleEdge = { _, _ -> },
                selectedCell = selectedCell?.takeIf { clue != null },
                onSelectCell = onSelectCell,
            )
        }

        if (clue == null || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = clue == SlitherlinkAuthoring.BLANK,
                    onClick = { onChange { SlitherlinkAuthoring.setClue(it, selCol, selRow, null) } },
                    label = { Text("Blank") },
                )
                for (n in SlitherlinkAuthoring.CLUE_RANGE) {
                    FilterChip(
                        selected = clue == n,
                        onClick = { onChange { SlitherlinkAuthoring.setClue(it, selCol, selRow, n) } },
                        label = { Text("$n") },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { SlitherlinkAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { SlitherlinkAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(SlitherlinkAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(SlitherlinkAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
