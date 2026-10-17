package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.NonogramAuthoring
import com.puzzleplatform.player.puzzle.NonogramDraft
import com.puzzleplatform.player.ui.board.NonogramBoard
import com.puzzleplatform.player.ui.board.NonogramMode

/**
 * Review body for a parsed nonogram, the Android analog of the web NonogramEditor:
 * the clues drawn on the read-only player board (to compare with the photo above),
 * any problems the API would reject, then one text field per row and column clue
 * with a delete button (for a parser's phantom line) and an add button per side
 * (for a missed one). Every edit goes straight to [onChange].
 */
@Composable
fun NonogramClueEditor(
    draft: NonogramDraft,
    onChange: ((NonogramDraft) -> NonogramDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val rowSum = draft.rowClues.sumOf { it.sum() }
        val colSum = draft.colClues.sumOf { it.sum() }
        Text(
            "${draft.rows} rows × ${draft.cols} columns · clue sums: rows $rowSum, columns $colSum",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in NonogramAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // Preview only: no input is kept, it's here to check the clues against the photo.
            NonogramBoard(
                puzzle = NonogramAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                liveValidate = false,
                mode = NonogramMode.FILL,
                onSetCell = { _, _, _ -> },
            )
        }

        Text("Row clues (top to bottom)", fontWeight = FontWeight.Medium)
        draft.rowClues.forEachIndexed { r, clue ->
            ClueField(
                label = "Row ${r + 1}",
                clue = clue,
                lineLength = draft.cols,
                canDelete = draft.rows > 1,
                onClue = { v -> onChange { NonogramAuthoring.setRowClue(it, r, v) } },
                onDelete = { onChange { NonogramAuthoring.removeRow(it, r) } },
            )
        }
        TextButton(onClick = { onChange(NonogramAuthoring::addRow) }) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Text("Add row")
        }

        Text("Column clues (left to right)", fontWeight = FontWeight.Medium)
        draft.colClues.forEachIndexed { c, clue ->
            ClueField(
                label = "Column ${c + 1}",
                clue = clue,
                lineLength = draft.rows,
                canDelete = draft.cols > 1,
                onClue = { v -> onChange { NonogramAuthoring.setColClue(it, c, v) } },
                onDelete = { onChange { NonogramAuthoring.removeCol(it, c) } },
            )
        }
        TextButton(onClick = { onChange(NonogramAuthoring::addCol) }) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Text("Add column")
        }
    }
}

/**
 * One clue line as text ("3 1 2"). The typed text is kept locally so a trailing
 * separator survives while typing; it only re-syncs from [clue] when the line's value
 * changes underneath it (e.g. a line above was deleted and this slot shifted).
 */
@Composable
private fun ClueField(
    label: String,
    clue: List<Int>,
    lineLength: Int,
    canDelete: Boolean,
    onClue: (List<Int>) -> Unit,
    onDelete: () -> Unit,
) {
    var text by remember { mutableStateOf(NonogramAuthoring.formatClue(clue)) }
    LaunchedEffect(clue) {
        if (NonogramAuthoring.parseClueText(text) != clue) text = NonogramAuthoring.formatClue(clue)
    }
    val needed = NonogramAuthoring.minLength(clue)
    val overflow = needed > lineLength

    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it
            onClue(NonogramAuthoring.parseClueText(it))
        },
        label = { Text(label) },
        singleLine = true,
        isError = overflow,
        supportingText = if (overflow) {
            { Text("Needs $needed cells, line has $lineLength") }
        } else null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        trailingIcon = {
            IconButton(onClick = onDelete, enabled = canDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete ${label.lowercase()}")
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
