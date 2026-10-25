package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.SlalomAuthoring
import com.puzzleplatform.player.puzzle.SlalomCell
import com.puzzleplatform.player.puzzle.SlalomDraft
import com.puzzleplatform.player.ui.board.SlalomBoard

/**
 * Review body for a parsed slalom, the Android analog of the web SlalomEditor: the draft
 * on the player board (tap a cell to select it), the circled gate count, any problems, and
 * a panel for the selected cell — make it empty, a wall, or part of a horizontal or
 * vertical gate (neighbouring gate cells along the line join into one gate), set its
 * gate's order number (blank for none), move the start circle there, or delete its
 * row/column (a parser's phantom line). Add row/column append an empty line for one the
 * parser missed. Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 *
 * A gate carrying two different numbers (two numbered gates joined) is a format problem:
 * listed, and a block on creating the question until one is cleared.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SlalomGateEditor(
    draft: SlalomDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((SlalomDraft) -> SlalomDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = selCol != null && selRow != null && draft.inGrid(selCol, selRow)
    val gateCount = SlalomAuthoring.gates(draft).size

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, $gateCount gates",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (SlalomAuthoring.formatProblems(draft).isNotEmpty()) {
            Text(
                "Fix before creating — each gate takes one number:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (problem in SlalomAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // The trail drag has nothing to draw into here, so its changes are dropped.
            SlalomBoard(
                puzzle = SlalomAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onApplyChanges = {},
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell = selectedCell?.takeIf { inGrid },
            )
        }

        ClueNumberField(
            label = "Gate count (the circled number)",
            clue = draft.gateCount,
            parse = SlalomAuthoring::parseNum,
            onClue = { v -> if (v != null) onChange { SlalomAuthoring.setGateCount(it, v) } },
            isError = draft.gateCount != gateCount,
            modifier = Modifier.fillMaxWidth(),
        )

        if (!inGrid || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val kind = draft.cellAt(selCol, selRow)
            val isStart = draft.start == (selRow to selCol)
            Text(
                "Row ${selRow + 1}, column ${selCol + 1}" + if (isStart) " (start)" else "",
                fontWeight = FontWeight.Medium,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((k, label) in KIND_LABELS) {
                    FilterChip(
                        selected = kind == k,
                        onClick = { onChange { SlalomAuthoring.setCell(it, selCol, selRow, k) } },
                        label = { Text(label) },
                    )
                }
            }
            val gate = SlalomAuthoring.gateAt(draft, selCol, selRow)
            if (gate != null) {
                // Re-key per gate (not on its number, or typing would drop focus) so each
                // selection starts its field from that gate's number.
                key(gate.vertical, gate.line, gate.from, gate.to) {
                    ClueNumberField(
                        label = "Gate ${gate.label} order (blank for none)",
                        clue = gate.numbers.singleOrNull(),
                        parse = SlalomAuthoring::parseNum,
                        onClue = { v -> onChange { SlalomAuthoring.setGateNumber(it, selCol, selRow, v) } },
                        isError = gate.numbers.size > 1 || (gate.numbers.singleOrNull() ?: 0) > draft.gateCount,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = { onChange { SlalomAuthoring.setStart(it, selCol, selRow) } },
                    enabled = !isStart,
                ) { Text("Start here") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { SlalomAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { SlalomAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(SlalomAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(SlalomAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}

private val KIND_LABELS = listOf(
    SlalomCell.EMPTY to "Empty",
    SlalomCell.WALL to "Wall",
    SlalomCell.GATE_H to "― Gate",
    SlalomCell.GATE_V to "| Gate",
)
