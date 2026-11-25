package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.MelonPieAuthoring
import com.puzzleplatform.player.puzzle.MelonPieEngine
import com.puzzleplatform.player.ui.board.MelonPieBoard

/**
 * Review body for a parsed Melon Pie board, the Android analog of the web MelonPieEditor:
 * the draft on the player board, its problems (also ringed on the board), and one tap
 * interaction — a tap on a grid point cycles its circle none -> white -> gray -> black.
 * Rows and columns of cells are added or removed at any edge.
 */
@Composable
fun MelonPieEditor(
    draft: MelonPieEngine.Board,
    onChange: ((MelonPieEngine.Board) -> MelonPieEngine.Board) -> Unit,
) {
    val format = MelonPieAuthoring.formatProblemCells(draft)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.height} × ${draft.width} cells, ${draft.circles.size} circles",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (format.isNotEmpty()) {
            Text(
                "Fix before creating — one circle per grid point, on the lattice:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (p in MelonPieAuthoring.problems(draft)) {
            Text(p, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (draft.width >= 1 && draft.height >= 1) {
            MelonPieBoard(
                puzzle = MelonPieAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onApplyChanges = {},
                onEditTap = { r, c -> onChange { MelonPieAuthoring.cycleCircle(it, r, c) } },
                problemPoints = format.map { it.r to it.c }.toSet(),
            )
        }
        Text(
            "Tap a grid point to cycle its circle: none, white, gray, black.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        GridEdgeControls(
            onAddRow = { top -> onChange { MelonPieAuthoring.addRow(it, top) } },
            onAddCol = { left -> onChange { MelonPieAuthoring.addCol(it, left) } },
            onRemoveRow = { top -> onChange { MelonPieAuthoring.removeEdgeRow(it, top) } },
            onRemoveCol = { left -> onChange { MelonPieAuthoring.removeEdgeCol(it, left) } },
            canRemoveRow = draft.height > 1,
            canRemoveCol = draft.width > 1,
        )
    }
}
