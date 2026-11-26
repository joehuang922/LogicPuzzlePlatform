package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.KuralinDraft
import com.puzzleplatform.player.puzzle.TetroChainKAuthoring
import com.puzzleplatform.player.ui.board.TetroChainKBoard

/**
 * Review body for a parsed Tetro Chain K board, the Android analog of the web
 * TetroChainKEditor: the draft on the player board, its problems, and one tap
 * interaction — a tap snaps to the nearest edge midpoint or corner and cycles its circle
 * none -> white -> gray -> black. Rows and columns are added or removed at any edge.
 */
@Composable
fun TetroChainKEditor(
    draft: KuralinDraft,
    onChange: ((KuralinDraft) -> KuralinDraft) -> Unit,
) {
    val format = TetroChainKAuthoring.formatProblemCells(draft)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.circles.size} circles",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (format.isNotEmpty()) {
            Text(
                "Fix before creating — circles sit on grid lines, one per spot:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (p in TetroChainKAuthoring.problems(draft)) {
            Text(p, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (draft.rows >= 2 && draft.cols >= 2) {
            TetroChainKBoard(
                puzzle = TetroChainKAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onTapPoint = { dr, dc -> onChange { TetroChainKAuthoring.cycleCircle(it, dr, dc) } },
                problemCells = format.map { it.r to it.c }.toSet(),
            )
        }
        Text(
            "Tap an edge midpoint or corner to cycle its circle: none, white, gray, black.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        GridEdgeControls(
            onAddRow = { top -> onChange { TetroChainKAuthoring.addRow(it, top) } },
            onAddCol = { left -> onChange { TetroChainKAuthoring.addCol(it, left) } },
            onRemoveRow = { top -> onChange { TetroChainKAuthoring.removeEdgeRow(it, top) } },
            onRemoveCol = { left -> onChange { TetroChainKAuthoring.removeEdgeCol(it, left) } },
            canRemoveRow = draft.rows > 2,
            canRemoveCol = draft.cols > 2,
        )
    }
}
