package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.MinusRoomAuthoring
import com.puzzleplatform.player.puzzle.MinusRoomEngine
import com.puzzleplatform.player.ui.board.MinusRoomBoard
import com.puzzleplatform.player.ui.board.wallKeyAt
import kotlin.math.floor

private enum class MinusRoomMode { NUMBERS, WALLS, CIRCLES }

/**
 * Review body for a parsed minus room, the Android analog of the web MinusRoomEditor: the
 * draft on the player board, any problems, a Max field, and three modes — Numbers (tap a
 * cell, type its given, blank for none), Walls (a tap snaps to the nearest interior edge
 * and toggles its room wall) and Circles (a tap snaps to the nearest interior edge and
 * selects it; type its difference, blank clears). Two fingers pan and zoom. Rows and
 * columns are added or removed at the bottom/right edge. Every edit goes straight to
 * [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MinusRoomEditor(
    draft: MinusRoomEngine.Board,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((MinusRoomEngine.Board) -> MinusRoomEngine.Board) -> Unit,
) {
    var mode by remember { mutableStateOf(MinusRoomMode.NUMBERS) }
    var selectedEdge by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val cellInGrid = mode == MinusRoomMode.NUMBERS && selCol != null && selRow != null && draft.inside(selRow, selCol)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, 1〜${draft.max}, " +
                "${draft.cells.sumOf { row -> row.count { it > 0 } }} givens, ${draft.circles.size} circles",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (MinusRoomAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — walls close off rooms, givens and circles fit 1〜${draft.max}:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in MinusRoomAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        key("max") {
            ClueNumberField(
                label = "Max (numbers 1 to …)",
                clue = draft.max,
                parse = MinusRoomAuthoring::parseNumber,
                onClue = { v -> onChange { MinusRoomAuthoring.setMax(it, v) } },
                modifier = Modifier.fillMaxWidth(),
            )
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((m, label) in listOf(MinusRoomMode.NUMBERS to "Numbers", MinusRoomMode.WALLS to "Walls", MinusRoomMode.CIRCLES to "Circles")) {
                FilterChip(
                    selected = mode == m,
                    onClick = {
                        mode = m
                        onSelectCell(null)
                        selectedEdge = null
                    },
                    label = { Text(label) },
                )
            }
        }

        if (draft.rows >= 2 && draft.cols >= 2) {
            MinusRoomBoard(
                puzzle = MinusRoomAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                selectedCell = selectedCell?.takeIf { cellInGrid },
                onSelectCell = {},
                onEditTap = { x, y ->
                    when (mode) {
                        MinusRoomMode.NUMBERS -> {
                            val col = floor(x).toInt()
                            val row = floor(y).toInt()
                            if (draft.inside(row, col)) {
                                val k = "$col,$row"
                                onSelectCell(if (selectedCell == k) null else k)
                            }
                        }
                        MinusRoomMode.WALLS -> wallKeyAt(x, y, draft.rows, draft.cols)?.let { k ->
                            onChange { MinusRoomAuthoring.toggleWall(it, k) }
                        }
                        MinusRoomMode.CIRCLES -> wallKeyAt(x, y, draft.rows, draft.cols)
                            ?.let(MinusRoomAuthoring::edgeOf)
                            ?.let { e -> selectedEdge = if (selectedEdge == e) null else e }
                    }
                },
                selectedEdge = selectedEdge.takeIf { mode == MinusRoomMode.CIRCLES },
            )
        }

        when (mode) {
            MinusRoomMode.NUMBERS -> if (!cellInGrid || selCol == null || selRow == null) {
                Hint("Tap a cell to edit its given number.")
            } else {
                Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
                key(selCol, selRow) {
                    ClueNumberField(
                        label = "Given (blank for none)",
                        clue = draft.given(selRow, selCol).takeIf { it > 0 },
                        parse = MinusRoomAuthoring::parseNumber,
                        onClue = { v -> onChange { MinusRoomAuthoring.setGiven(it, selRow, selCol, v) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            MinusRoomMode.WALLS -> Hint("Tap a line between two cells to toggle a room wall.")
            MinusRoomMode.CIRCLES -> {
                val edge = selectedEdge
                if (edge == null) {
                    Hint("Tap a line between two cells to select its circle.")
                } else {
                    val (dr, dc) = edge
                    key(dr, dc) {
                        ClueNumberField(
                            label = "Circled difference (blank for none)",
                            clue = draft.circles.firstOrNull { it.dr == dr && it.dc == dc }?.value,
                            parse = MinusRoomAuthoring::parseDifference,
                            onClue = { v -> onChange { MinusRoomAuthoring.setCircle(it, dr, dc, v) } },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(MinusRoomAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(MinusRoomAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(MinusRoomAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(MinusRoomAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
