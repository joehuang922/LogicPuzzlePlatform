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
import com.puzzleplatform.player.puzzle.YajilinAuthoring
import com.puzzleplatform.player.puzzle.YajilinDraft
import com.puzzleplatform.player.puzzle.YajilinEngine.Dir
import com.puzzleplatform.player.ui.board.YajilinBoard

/**
 * Review body for a parsed yajilin, the Android analog of the web YajilinEditor: the clue
 * grid on the player board (tap a cell to select it), any problems that can't be right,
 * and a panel for the selected cell — make it empty or point its arrow (an empty cell
 * becomes a 0 clue), type its count, or delete its row/column (a parser's phantom line).
 * Add row/column append an empty line for one the parser missed. Every edit goes
 * straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun YajilinClueEditor(
    draft: YajilinDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((YajilinDraft) -> YajilinDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = selCol != null && selRow != null && draft.inGrid(selCol, selRow)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in YajilinAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // The loop drag has nothing to draw into here, so its changes are dropped.
            YajilinBoard(
                puzzle = YajilinAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                onApplyChanges = {},
                selectedCell = selectedCell?.takeIf { inGrid },
            )
        }

        if (!inGrid || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val clue = draft.cellAt(selCol, selRow)
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = clue == null,
                    onClick = { onChange { YajilinAuthoring.clear(it, selCol, selRow) } },
                    label = { Text("Empty") },
                )
                for (dir in Dir.entries) {
                    FilterChip(
                        selected = clue?.dir == dir,
                        onClick = { onChange { YajilinAuthoring.setDir(it, selCol, selRow, dir) } },
                        label = { Text(YajilinAuthoring.arrow(dir)) },
                    )
                }
            }
            if (clue != null) {
                val max = YajilinAuthoring.maxShaded(draft, selCol, selRow, clue.dir)
                // Re-key per cell so each selection starts its field from that cell's count.
                key(selCol, selRow) {
                    ClueNumberField(
                        label = "Count (at most $max)",
                        clue = clue.num,
                        parse = YajilinAuthoring::parseNum,
                        onClue = { v -> if (v != null) onChange { YajilinAuthoring.setNum(it, selCol, selRow, v) } },
                        isError = clue.num > max,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { YajilinAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { YajilinAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(YajilinAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(YajilinAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
