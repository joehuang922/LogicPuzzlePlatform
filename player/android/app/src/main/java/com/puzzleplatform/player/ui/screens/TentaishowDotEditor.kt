package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.TentaishowAuthoring
import com.puzzleplatform.player.puzzle.TentaishowDraft
import com.puzzleplatform.player.ui.board.TentaishowBoard

/**
 * Review body for a parsed tentaishow, the Android analog of the web TentaishowEditor:
 * the board with its dots on the player board, any problems, and a tap that snaps to the
 * nearest cell center, edge midpoint or corner and cycles the dot there
 * none -> ○ -> ● -> none. Rows and columns are added or removed at the bottom/right edge
 * (see [TentaishowAuthoring]). Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TentaishowDotEditor(
    draft: TentaishowDraft,
    onChange: ((TentaishowDraft) -> TentaishowDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.dots.size} dots",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (TentaishowAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in TentaishowAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // The play input has nothing to write into here, so it's dropped.
            TentaishowBoard(
                puzzle = TentaishowAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onSetEdge = { _, _ -> },
                onTapPoint = { dr, dc -> onChange { TentaishowAuthoring.cycleDot(it, dr, dc) } },
            )
        }
        Text(
            "Tap a cell center, edge or corner to cycle its dot: none → ○ → ● → none.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(TentaishowAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(TentaishowAuthoring::removeLastRow) }, enabled = draft.rows > 1) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(TentaishowAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(TentaishowAuthoring::removeLastCol) }, enabled = draft.cols > 1) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
