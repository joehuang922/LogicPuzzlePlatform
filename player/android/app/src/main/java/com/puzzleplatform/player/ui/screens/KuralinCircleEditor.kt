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
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.KuralinAuthoring
import com.puzzleplatform.player.puzzle.KuralinDraft
import com.puzzleplatform.player.ui.board.KuralinBoard

/**
 * Review body for a parsed kuralin, the Android analog of the web KuralinEditor: the board
 * with its circles on the player board, any problems, and a tap on a grid line (edge
 * midpoint or corner) that cycles the circle there none -> ○ -> ● -> gray -> none. Rows and
 * columns are added or removed at the bottom/right edge (see [KuralinAuthoring]). Every
 * edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun KuralinCircleEditor(
    draft: KuralinDraft,
    onChange: ((KuralinDraft) -> KuralinDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in KuralinAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // The play input has nothing to write into here, so it's dropped.
            KuralinBoard(
                puzzle = KuralinAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onApplyChanges = {},
                onTapPoint = { dr, dc -> onChange { KuralinAuthoring.cycleCircle(it, dr, dc) } },
            )
        }
        Text(
            "Tap a grid line or corner to cycle its circle: none → ○ → ● → gray → none.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(KuralinAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(KuralinAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(KuralinAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(KuralinAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
