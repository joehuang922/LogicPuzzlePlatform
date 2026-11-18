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
import com.puzzleplatform.player.puzzle.OminoTreeAuthoring
import com.puzzleplatform.player.puzzle.OminoTreeEngine
import com.puzzleplatform.player.ui.board.OminoTreeBoard
import com.puzzleplatform.player.ui.board.wallKeyAt
import kotlin.math.floor

/**
 * Review body for a parsed omino tree, the Android analog of the web OminoTreeEditor: the
 * draft on the player board, any problems, and two modes — Numbers (tap a cell to select
 * it, then type its number, blank for none) and Arrows (a tap snaps to the nearest
 * interior edge and cycles its arrow none -> right/down -> left/up -> none). Two fingers
 * pan and zoom. Rows and columns are added or removed at the bottom/right edge. Every edit
 * goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OminoTreeEditor(
    draft: OminoTreeEngine.Board,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((OminoTreeEngine.Board) -> OminoTreeEngine.Board) -> Unit,
) {
    var arrowMode by remember { mutableStateOf(false) }
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = !arrowMode && selCol != null && selRow != null && draft.inside(selRow, selCol)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.numbers.sumOf { row -> row.count { it > 0 } }} numbers, " +
                "${draft.arrows.size} arrows",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (OminoTreeAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — every arrow joins two cells on the board, one arrow per edge:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in OminoTreeAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = !arrowMode, onClick = { arrowMode = false }, label = { Text("Numbers") })
            FilterChip(
                selected = arrowMode,
                onClick = {
                    arrowMode = true
                    onSelectCell(null)
                },
                label = { Text("Arrows") },
            )
        }

        if (draft.rows >= 2 && draft.cols >= 2) {
            OminoTreeBoard(
                puzzle = OminoTreeAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onSetEdge = { _, _ -> },
                onEditTap = { x, y ->
                    if (arrowMode) {
                        val edge = wallKeyAt(x, y, draft.rows, draft.cols)
                        if (edge != null) onChange { OminoTreeAuthoring.cycleArrow(it, edge) }
                    } else {
                        val col = floor(x).toInt()
                        val row = floor(y).toInt()
                        if (draft.inside(row, col)) {
                            val key = "$col,$row"
                            onSelectCell(if (selectedCell == key) null else key)
                        }
                    }
                },
                selectedCell = selectedCell?.takeIf { inGrid },
            )
        }

        if (arrowMode) {
            Text(
                "Tap an edge between two cells to cycle its arrow: → or ↓, then ← or ↑, then none.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (!inGrid || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit its number.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            // Re-key per cell so each selection starts its field from that cell's number.
            key(selCol, selRow) {
                ClueNumberField(
                    label = "Number (blank for none)",
                    clue = draft.number(selRow, selCol).takeIf { it > 0 },
                    parse = OminoTreeAuthoring::parseNumber,
                    onClue = { v -> onChange { OminoTreeAuthoring.setNumber(it, selRow, selCol, v) } },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(OminoTreeAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(OminoTreeAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(OminoTreeAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(OminoTreeAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
