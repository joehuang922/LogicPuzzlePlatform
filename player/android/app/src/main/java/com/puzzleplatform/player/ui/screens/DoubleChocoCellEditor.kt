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
import com.puzzleplatform.player.puzzle.DoubleChocoAuthoring
import com.puzzleplatform.player.puzzle.DoubleChocoDraft
import com.puzzleplatform.player.ui.board.DoubleChocoBoard

/**
 * Review body for a parsed double choco, the Android analog of the web
 * DoubleChocoEditor: the grid on the player [DoubleChocoBoard] (tap a cell to select it),
 * any problems that can't be right, and a panel for the selected cell — make it white or
 * gray, type its number (blank for none), or delete its row/column (a parser's phantom
 * line). Add row/column append a white line for one the parser missed. Every edit goes
 * straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DoubleChocoCellEditor(
    draft: DoubleChocoDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((DoubleChocoDraft) -> DoubleChocoDraft) -> Unit,
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
        for (problem in DoubleChocoAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            DoubleChocoBoard(
                puzzle = DoubleChocoAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onSetEdge = { _, _ -> },
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell = selectedCell?.takeIf { inGrid },
            )
        }

        if (!inGrid || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit its color or number.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val cell = draft.cellAt(selCol, selRow)
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = !cell.gray,
                    onClick = { onChange { DoubleChocoAuthoring.setGray(it, selCol, selRow, false) } },
                    label = { Text("White") },
                )
                FilterChip(
                    selected = cell.gray,
                    onClick = { onChange { DoubleChocoAuthoring.setGray(it, selCol, selRow, true) } },
                    label = { Text("Gray") },
                )
            }
            // Re-key per cell so each selection starts its field from that cell's number.
            key(selCol, selRow) {
                ClueNumberField(
                    label = "Number (blank for none)",
                    clue = cell.number.takeIf { it > 0 },
                    parse = DoubleChocoAuthoring::parseNumber,
                    onClue = { v -> onChange { DoubleChocoAuthoring.setNumber(it, selCol, selRow, v) } },
                    isError = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { DoubleChocoAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { DoubleChocoAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(DoubleChocoAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(DoubleChocoAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
