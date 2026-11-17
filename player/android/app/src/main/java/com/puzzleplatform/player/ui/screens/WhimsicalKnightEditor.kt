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
import com.puzzleplatform.player.puzzle.WhimsicalKnightAuthoring
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine
import com.puzzleplatform.player.ui.board.WhimsicalKnightBoard

/**
 * Review body for a parsed whimsical knight, the Android analog of the web
 * WhimsicalKnightEditor: the draft on the player board, any problems, and one tap
 * interaction — between four dots toggles the gray square, on a dot cycles
 * none -> circle -> square -> none, between two dots toggles a circle. Two fingers pan and
 * zoom. Rows and columns of dots are added or removed at the bottom/right edge. Every
 * edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WhimsicalKnightEditor(
    draft: WhimsicalKnightEngine.Board,
    onChange: ((WhimsicalKnightEngine.Board) -> WhimsicalKnightEngine.Board) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} × ${draft.cols} dots, ${draft.circles.size} circles, ${draft.squares.size} squares, " +
                "${draft.gray.sumOf { row -> row.count { it == 1 } }} gray",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (WhimsicalKnightAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — squares sit on dots, circles on dots or between two:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in WhimsicalKnightAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows >= 2 && draft.cols >= 2) {
            WhimsicalKnightBoard(
                puzzle = WhimsicalKnightAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onApplyChanges = {},
                onEditTap = { x, y -> onChange { WhimsicalKnightAuthoring.tap(it, x, y) } },
            )
        }
        Text(
            "Tap between four dots to toggle a gray square, a dot to cycle circle → square → none, " +
                "or between two dots to toggle a circle.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(WhimsicalKnightAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(WhimsicalKnightAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(WhimsicalKnightAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(WhimsicalKnightAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
