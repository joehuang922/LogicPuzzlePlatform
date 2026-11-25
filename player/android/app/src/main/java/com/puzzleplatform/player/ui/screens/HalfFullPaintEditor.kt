package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.HalfFullPaintAuthoring
import com.puzzleplatform.player.puzzle.HalfFullPaintEngine
import com.puzzleplatform.player.puzzle.KuralinEngine
import com.puzzleplatform.player.ui.board.HalfFullPaintBoard
import com.puzzleplatform.player.ui.board.wallKeyAt

private enum class HalfFullPaintMode { WALLS, CIRCLES }

/**
 * Review body for a parsed Half-Full Paint board, the Android analog of the web
 * HalfFullPaintEditor: the draft on the player board (no picture preview), its problems
 * (also marked on the board), and two modes — Walls (a tap snaps to the nearest interior
 * edge and toggles its wall) and Circles (a tap snaps to the nearest edge midpoint or
 * corner and cycles none -> white -> gray -> black). Rows and columns are added or removed
 * at any edge. Edits never refuse a layout; format problems are listed and block creating.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HalfFullPaintEditor(
    draft: HalfFullPaintEngine.Board,
    onChange: ((HalfFullPaintEngine.Board) -> HalfFullPaintEngine.Board) -> Unit,
) {
    var mode by remember { mutableStateOf(HalfFullPaintMode.WALLS) }
    val format = HalfFullPaintAuthoring.formatProblemCells(draft)
    val warnings = if (format.isEmpty()) HalfFullPaintAuthoring.warningCells(draft) else emptyList()

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${HalfFullPaintEngine.rooms(draft).second} rooms, " +
                "${draft.circles.size} circles",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (format.isNotEmpty()) {
            Text(
                "Fix before creating — walls close off rooms, circles sit on grid lines:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (p in HalfFullPaintAuthoring.problems(draft)) {
            Text(p, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((m, label) in listOf(HalfFullPaintMode.WALLS to "Walls", HalfFullPaintMode.CIRCLES to "Circles")) {
                FilterChip(selected = mode == m, onClick = { mode = m }, label = { Text(label) })
            }
        }

        if (draft.rows >= 2 && draft.cols >= 2) {
            HalfFullPaintBoard(
                puzzle = HalfFullPaintAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onEditTap = { x, y ->
                    when (mode) {
                        HalfFullPaintMode.WALLS -> wallKeyAt(x, y, draft.rows, draft.cols)?.let { k ->
                            onChange { HalfFullPaintAuthoring.toggleWall(it, k) }
                        }
                        HalfFullPaintMode.CIRCLES -> KuralinEngine.nearestPoint(x, y, draft.rows, draft.cols)?.let { (dr, dc) ->
                            onChange { HalfFullPaintAuthoring.cycleCircle(it, dr, dc) }
                        }
                    }
                },
                problemCells = (format + warnings).map { it.r to it.c }.toSet(),
            )
        }

        Text(
            when (mode) {
                HalfFullPaintMode.WALLS -> "Tap a line between two cells to toggle a room wall."
                HalfFullPaintMode.CIRCLES -> "Tap an edge midpoint or corner to cycle its circle: none, white, gray, black."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        GridEdgeControls(
            onAddRow = { top -> onChange { HalfFullPaintAuthoring.addRow(it, top) } },
            onAddCol = { left -> onChange { HalfFullPaintAuthoring.addCol(it, left) } },
            onRemoveRow = { top -> onChange { HalfFullPaintAuthoring.removeEdgeRow(it, top) } },
            onRemoveCol = { left -> onChange { HalfFullPaintAuthoring.removeEdgeCol(it, left) } },
            canRemoveRow = draft.rows > 2,
            canRemoveCol = draft.cols > 2,
        )
    }
}
