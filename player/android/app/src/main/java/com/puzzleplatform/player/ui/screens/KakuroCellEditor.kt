package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.KakuroAuthoring
import com.puzzleplatform.player.puzzle.KakuroDraft
import com.puzzleplatform.player.puzzle.KakuroEngine
import com.puzzleplatform.player.ui.board.KakuroBoard

/**
 * Review body for a parsed kakuro, the Android analog of the web KakuroEditor: the
 * grid on the player board (tap any cell to select it), any problems that can't be
 * right, and a panel for the selected cell — switch it between clue and white, edit a
 * clue's across/down sums, or delete its row/column (a parser's phantom line). Add
 * row/column append a line of blank clue cells for one the parser missed. Every edit
 * goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun KakuroCellEditor(
    draft: KakuroDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((KakuroDraft) -> KakuroDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val cell = if (selCol != null && selRow != null) draft.cellAt(selCol, selRow) else null

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in KakuroAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            KakuroBoard(
                puzzle = KakuroAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                liveValidate = false,
                selectedCell = selectedCell?.takeIf { cell != null },
                onSelectCell = onSelectCell,
                selectAnyCell = true,
            )
        }

        if (cell == null || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = cell is KakuroEngine.Cell.Clue,
                    onClick = { if (cell !is KakuroEngine.Cell.Clue) onChange { KakuroAuthoring.toggleCell(it, selCol, selRow) } },
                    label = { Text("Clue") },
                )
                FilterChip(
                    selected = cell == KakuroEngine.Cell.Empty,
                    onClick = { if (cell is KakuroEngine.Cell.Clue) onChange { KakuroAuthoring.toggleCell(it, selCol, selRow) } },
                    label = { Text("White") },
                )
            }
            if (cell is KakuroEngine.Cell.Clue) {
                // Re-key per cell so each selection starts its fields from that cell's sums.
                key(selCol, selRow) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        SumField(
                            label = "Across →",
                            sum = cell.right,
                            onSum = { v -> onChange { KakuroAuthoring.setAcross(it, selCol, selRow, v) } },
                            modifier = Modifier.weight(1f),
                        )
                        SumField(
                            label = "Down ↓",
                            sum = cell.down,
                            onSum = { v -> onChange { KakuroAuthoring.setDown(it, selCol, selRow, v) } },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { KakuroAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { KakuroAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(KakuroAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(KakuroAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}

/**
 * One sum as a number field; blank means no sum. The typed text is kept locally and
 * only re-synced when [sum] changes underneath it.
 */
@Composable
private fun SumField(
    label: String,
    sum: Int?,
    onSum: (Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var text by remember { mutableStateOf(sum?.toString() ?: "") }
    LaunchedEffect(sum) {
        if (KakuroAuthoring.parseSum(text) != sum) text = sum?.toString() ?: ""
    }
    val outOfRange = sum != null && sum !in KakuroAuthoring.SUM_RANGE

    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it.filter { ch -> ch.isDigit() }.take(2)
            onSum(KakuroAuthoring.parseSum(text))
        },
        label = { Text(label) },
        singleLine = true,
        isError = outOfRange,
        supportingText = if (outOfRange) {
            { Text("1–45") }
        } else null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}
