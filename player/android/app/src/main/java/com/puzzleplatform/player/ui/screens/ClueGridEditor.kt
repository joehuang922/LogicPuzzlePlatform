package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.ClueGridAuthoring
import com.puzzleplatform.player.puzzle.ClueGridDraft

/**
 * Review body for a parsed number-clue puzzle (number link, shikaku): the clue grid on the
 * type's player [board] (tap a cell to select it; the board gets the preview puzzle, the
 * tap callback and the "col,row" selection), any problems that can't be right, and a
 * panel for the selected cell — type its clue ([clueLabel], blank for none), or delete its
 * row/column (a parser's phantom line). Add row/column append a blank line for one the
 * parser missed. Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClueGridEditor(
    authoring: ClueGridAuthoring,
    draft: ClueGridDraft,
    clueLabel: String,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((ClueGridDraft) -> ClueGridDraft) -> Unit,
    board: @Composable (puzzle: Puzzle, onTapCell: (col: Int, row: Int) -> Unit, selectedCell: String?) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = selCol != null && selRow != null && draft.inGrid(selCol, selRow)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in authoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            board(
                authoring.previewPuzzle(draft),
                { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell?.takeIf { inGrid },
            )
        }

        if (!inGrid || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            // Re-key per cell so each selection starts its field from that cell's clue.
            key(selCol, selRow) {
                ClueNumberField(
                    label = "$clueLabel (blank for none)",
                    clue = draft.cellAt(selCol, selRow).takeIf { it > 0 },
                    parse = authoring::parseClue,
                    onClue = { v -> onChange { authoring.setClue(it, selCol, selRow, v) } },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { authoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { authoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(authoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(authoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
