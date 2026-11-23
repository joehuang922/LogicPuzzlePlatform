package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.MannequinGate2Authoring
import com.puzzleplatform.player.puzzle.MannequinGate2Rules
import com.puzzleplatform.player.ui.board.MannequinGate2Board

/**
 * Review body for a parsed Mannequin Gate 2, the Android analog of the web
 * MannequinGate2Editor: the draft on the player board, any problems, and two modes —
 * Draw (drag from cell to cell, diagonals too, to add a line) and Delete (tap a cell to
 * remove the latest line through it). Two fingers pan and zoom. Rows and columns are added
 * or removed at the bottom/right edge. Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MannequinGate2Editor(
    draft: MannequinGate2Rules.Board,
    onChange: ((MannequinGate2Rules.Board) -> MannequinGate2Rules.Board) -> Unit,
) {
    var deleting by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.lines.size} lines",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (MannequinGate2Authoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — each line steps between neighbouring cells and no two lines share a step:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in MannequinGate2Authoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = !deleting, onClick = { deleting = false }, label = { Text("Draw") })
            FilterChip(selected = deleting, onClick = { deleting = true }, label = { Text("Delete") })
        }

        if (draft.rows > 0 && draft.cols > 0) {
            MannequinGate2Board(
                puzzle = MannequinGate2Authoring.previewPuzzle(draft),
                userValues = emptyMap(),
                liveValidate = false,
                onTapCell = { _, _ -> },
                onDrawLine = if (deleting) null else { cells -> onChange { MannequinGate2Authoring.addLine(it, cells) } },
                onEditTapCell = { col, row ->
                    if (deleting) onChange { MannequinGate2Authoring.removeLineAt(it, row, col) }
                },
            )
        }
        Text(
            if (deleting) "Tap a cell to delete the latest line through it."
            else "Drag from cell to cell (diagonals too) to draw a line; drag back to undo a step.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(MannequinGate2Authoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(MannequinGate2Authoring::removeLastRow) }, enabled = draft.rows > 1) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(MannequinGate2Authoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(MannequinGate2Authoring::removeLastCol) }, enabled = draft.cols > 1) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
