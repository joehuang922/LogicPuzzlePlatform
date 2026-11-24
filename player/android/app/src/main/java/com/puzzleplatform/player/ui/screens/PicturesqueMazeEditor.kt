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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.PicturesqueMazeAuthoring
import com.puzzleplatform.player.puzzle.PicturesqueMazeEngine
import com.puzzleplatform.player.ui.board.PicturesqueMazeBoard

private val WARNING_MARK = Color(0xFFE69500)
private val PROBLEM_MARK = Color(0xFFCC3333)
private val WARNING_TEXT = Color(0xFFA66B00)

/**
 * Review body for a parsed picturesque maze, the Android analog of the web
 * PicturesqueMazeEditor: the draft on the player board, the format problems (which block
 * creating), the overridable "not a perfect maze" warnings with their cells marked, a
 * Route toggle that overlays the shortest route (the quickest way to see the picture and
 * spot a misread wall), and the edits:
 *  - a tap on a line between two cells toggles its wall;
 *  - a tap on the border moves the entrance there, or the exit in Exit mode.
 * Two fingers still pan and zoom. Rows and columns are added or removed at the
 * bottom/right edge. Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PicturesqueMazeEditor(
    draft: PicturesqueMazeEngine.Board,
    onChange: ((PicturesqueMazeEngine.Board) -> PicturesqueMazeEngine.Board) -> Unit,
) {
    var exitMode by remember { mutableStateOf(false) }
    var showRoute by remember { mutableStateOf(true) }

    val problems = PicturesqueMazeAuthoring.formatProblems(draft)
    val warnings = PicturesqueMazeEngine.warnings(draft)
    val tied = if (problems.isNotEmpty()) PicturesqueMazeEngine.tiedRouteCells(draft) else emptyList()
    val marks = warnings.loopCells.map { it to WARNING_MARK } +
        warnings.unreachable.map { it to WARNING_MARK } +
        tied.map { it to PROBLEM_MARK }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (problems.isNotEmpty()) {
            Text(
                "Fix before creating:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
            for (problem in problems) {
                Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
        for (warning in PicturesqueMazeEngine.warningMessages(warnings)) {
            Text(warning, style = MaterialTheme.typography.bodySmall, color = WARNING_TEXT)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = !exitMode, onClick = { exitMode = false }, label = { Text("Entrance") })
            FilterChip(selected = exitMode, onClick = { exitMode = true }, label = { Text("Exit") })
            FilterChip(selected = showRoute, onClick = { showRoute = !showRoute }, label = { Text("Route") })
        }

        if (draft.rows > 0 && draft.cols > 0) {
            PicturesqueMazeBoard(
                puzzle = PicturesqueMazeAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onApplyChanges = {},
                onEditTap = { col, row -> onChange { PicturesqueMazeAuthoring.tap(it, col, row, exitMode) } },
                showRoute = showRoute,
                marks = marks,
            )
        }
        Text(
            "Tap a line between two cells to toggle its wall; tap the border to move the " +
                (if (exitMode) "exit" else "entrance") + " there.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(PicturesqueMazeAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(PicturesqueMazeAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(PicturesqueMazeAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(PicturesqueMazeAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
