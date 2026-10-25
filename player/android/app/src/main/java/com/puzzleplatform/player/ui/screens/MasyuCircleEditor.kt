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
import com.puzzleplatform.player.puzzle.MasyuAuthoring
import com.puzzleplatform.player.puzzle.MasyuDraft
import com.puzzleplatform.player.puzzle.MasyuEngine
import com.puzzleplatform.player.ui.board.MasyuBoard

/**
 * Review body for a parsed masyu, the Android analog of the web MasyuEditor: the circle
 * grid on the player board (tap a cell to select it), any problems that can't be right,
 * and a panel for the selected cell — make it empty, a white or a black circle, or delete
 * its row/column (a parser's phantom line). Add row/column append an empty line for one
 * the parser missed. Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MasyuCircleEditor(
    draft: MasyuDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((MasyuDraft) -> MasyuDraft) -> Unit,
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
        for (problem in MasyuAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // The loop drag has nothing to draw into here, so its edges are dropped.
            MasyuBoard(
                puzzle = MasyuAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                liveValidate = false,
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
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val kind = draft.cellAt(selCol, selRow)
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((k, label) in KIND_LABELS) {
                    FilterChip(
                        selected = kind == k,
                        onClick = { onChange { MasyuAuthoring.setCell(it, selCol, selRow, k) } },
                        label = { Text(label) },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { MasyuAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { MasyuAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(MasyuAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(MasyuAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}

private val KIND_LABELS = listOf(
    MasyuEngine.EMPTY to "Empty",
    MasyuEngine.WHITE to "○ White",
    MasyuEngine.BLACK to "● Black",
)
