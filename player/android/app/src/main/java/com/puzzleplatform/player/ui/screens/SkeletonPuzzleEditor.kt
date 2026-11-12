package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.SkeletonPuzzleAuthoring
import com.puzzleplatform.player.puzzle.SkeletonRules
import com.puzzleplatform.player.ui.board.ZoomableBoard
import com.puzzleplatform.player.ui.board.drawSkeleton

/**
 * Review body for a parsed Skeleton Puzzle, the Android analog of the web
 * SkeletonPuzzleEditor: the board (non-cells grey, each slot's length at its start; tap a
 * square to select it), the format problems that block saving and the warnings, then for
 * the selected square: make it a cell or not, add/remove its double-frame mark, or delete
 * its row/column. The word list is a text field, one word per line as "word (hint)".
 * Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SkeletonPuzzleEditor(
    draft: SkeletonRules.Board,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((SkeletonRules.Board) -> SkeletonRules.Board) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = selCol != null && selRow != null && selRow in 0 until draft.rows && selCol in 0 until draft.cols
    val draftState = rememberUpdatedState(draft)
    val selectedState = rememberUpdatedState(if (inGrid) setOf(selRow!! to selCol!!) else emptySet())

    // The text field keeps what was typed; it resyncs only when the words change elsewhere.
    var wordText by remember { mutableStateOf(SkeletonRules.wordLines(draft.words)) }
    LaunchedEffect(draft.words) {
        if (SkeletonRules.parseWordLines(wordText) != draft.words) wordText = SkeletonRules.wordLines(draft.words)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val slots = SkeletonRules.findSlots(draft.cells)
        Text(
            "${draft.rows} rows × ${draft.cols} columns · ${slots.size} slots, ${draft.words.size} words",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in SkeletonPuzzleAuthoring.formatProblems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        for (warning in SkeletonRules.warnings(draft)) {
            Text(warning, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            ZoomableBoard(
                cols = draft.cols,
                rows = draft.rows,
                resetKey = "skeleton-edit-${draft.rows}x${draft.cols}",
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
            ) { cell ->
                drawSkeleton(draftState.value, null, selectedState.value, cell, editing = true)
            }
        }

        if (!inGrid || selCol == null || selRow == null) {
            Text(
                "Tap a square to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val isCell = SkeletonRules.isCell(draft.cells, selRow, selCol)
            val marked = draft.marks.any { it.r == selRow && it.c == selCol }
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = { onChange { SkeletonPuzzleAuthoring.toggleCell(it, selCol, selRow) } }) {
                    Text(if (isCell) "Make not a cell" else "Make a cell")
                }
                OutlinedButton(
                    onClick = { onChange { SkeletonPuzzleAuthoring.toggleMark(it, selCol, selRow) } },
                    enabled = isCell,
                ) { Text(if (marked) "Remove mark" else "Add mark") }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { SkeletonPuzzleAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { SkeletonPuzzleAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(SkeletonPuzzleAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(SkeletonPuzzleAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }

        OutlinedTextField(
            value = wordText,
            onValueChange = { text ->
                wordText = text
                onChange { SkeletonPuzzleAuthoring.setWords(it, text) }
            },
            label = { Text("Words, one per line: word (hint)") },
            modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
        )
    }
}
