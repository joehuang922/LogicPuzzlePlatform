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
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.BlackCell
import com.puzzleplatform.player.puzzle.BlackCellAuthoring
import com.puzzleplatform.player.puzzle.BlackCellDraft

/**
 * Review body for a parsed black-cell puzzle (shakashaka, akari): the grid on the type's
 * player [board] (tap a cell to select it; the board gets the preview puzzle, the tap
 * callback and the "col,row" selection), any problems that can't be right, and a panel
 * for the selected cell — make it white or black, type a black cell's number (blank for
 * none), or delete its row/column (a parser's phantom line). Add row/column append a
 * white line for one the parser missed. Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BlackCellEditor(
    authoring: BlackCellAuthoring,
    draft: BlackCellDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((BlackCellDraft) -> BlackCellDraft) -> Unit,
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
            val value = draft.cellAt(selCol, selRow)
            val black = value != BlackCell.WHITE
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = !black,
                    onClick = { onChange { authoring.setWhite(it, selCol, selRow) } },
                    label = { Text("White") },
                )
                FilterChip(
                    selected = black,
                    // Keep a number already there; a white cell becomes unnumbered black.
                    onClick = { if (!black) onChange { authoring.setBlack(it, selCol, selRow, null) } },
                    label = { Text("Black") },
                )
            }
            if (black) {
                val max = authoring.whiteNeighbours(draft, selCol, selRow)
                val number = value.takeIf { it in 0..4 }
                // Re-key per cell so each selection starts its field from that cell's number.
                key(selCol, selRow) {
                    ClueNumberField(
                        label = "Number 0–$max (blank for none)",
                        clue = number,
                        parse = authoring::parseNum,
                        onClue = { v -> onChange { authoring.setBlack(it, selCol, selRow, v) } },
                        isError = (number ?: 0) > max,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
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
