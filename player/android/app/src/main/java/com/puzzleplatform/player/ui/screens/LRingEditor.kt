package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.ClueGridDraft
import com.puzzleplatform.player.puzzle.LRingAuthoring
import com.puzzleplatform.player.puzzle.LRingRules
import com.puzzleplatform.player.ui.board.LRingBoard
import com.puzzleplatform.player.ui.board.drawLRingArrow

/**
 * Review body for a parsed L-Ring, the Android analog of the web LRingEditor: the board
 * (tap a cell to select it), any warnings, and chips for the selected cell — empty or an
 * arrow up / right / down / left; or delete its row/column (a parser's phantom line). Add
 * row/column append an empty line for one the parser missed. Every edit goes straight to
 * [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LRingEditor(
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
        for (problem in LRingAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // No loop is drawn here, so the edge writes are dropped.
            LRingBoard(
                puzzle = LRingAuthoring.previewPuzzle(draft),
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

        if (value == null || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = value == LRingRules.EMPTY,
                    onClick = { onChange { LRingAuthoring.setCell(it, selCol, selRow, LRingRules.EMPTY) } },
                    label = { Text("Empty") },
                )
                for ((code, _, name) in LRingRules.ARROWS) {
                    FilterChip(
                        selected = value == code,
                        onClick = { onChange { LRingAuthoring.setCell(it, selCol, selRow, code) } },
                        label = { Text(name) },
                        leadingIcon = {
                            Canvas(Modifier.size(18.dp)) { drawLRingArrow(code, center, size.minDimension) }
                        },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { LRingAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { LRingAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(LRingAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(LRingAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
