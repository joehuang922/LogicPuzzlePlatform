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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.YajilixAuthoring
import com.puzzleplatform.player.puzzle.YajilixEngine
import com.puzzleplatform.player.ui.board.YajilixBoard

/**
 * Review body for a parsed Yajilix board, the Android analog of the web YajilixEditor:
 * the draft on the player board, its problems (also marked on the board), and the
 * selected cell's controls — kind chips (Empty / L / I / X), arrow chips and −/+ for its
 * number. Rows and columns are added or removed at the bottom/right edge.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun YajilixEditor(
    draft: YajilixEngine.Board,
    onChange: ((YajilixEngine.Board) -> YajilixEngine.Board) -> Unit,
) {
    var selected by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val sel = selected?.takeIf { (r, c) -> r in 0 until draft.rows && c in 0 until draft.cols }
    val format = YajilixAuthoring.formatProblemCells(draft)
    val warnings = if (format.isEmpty()) YajilixAuthoring.warningCells(draft) else emptyList()

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.cells.sumOf { row -> row.count { it != null } }} clues",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (p in YajilixAuthoring.problems(draft)) {
            Text(p, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows >= 2 && draft.cols >= 2) {
            YajilixBoard(
                puzzle = YajilixAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onApplyChanges = {},
                onEditTap = { col, row ->
                    val cell = row to col
                    selected = if (selected == cell) null else cell
                },
                selectedCell = sel,
                problemCells = (format + warnings).map { it.r to it.c }.toSet(),
            )
        }

        if (sel == null) {
            Text("Tap a cell to edit its clue.", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val (r, c) = sel
            val clue = draft.clue(r, c)
            Text("Row ${r + 1}, column ${c + 1}: ${clue?.label ?: "empty"}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = clue == null, onClick = { onChange { YajilixAuthoring.setKind(it, r, c, null) } },
                    label = { Text("Empty") })
                for (k in YajilixEngine.KINDS) {
                    FilterChip(selected = clue?.kind == k, onClick = { onChange { YajilixAuthoring.setKind(it, r, c, k) } },
                        label = { Text(k.toString()) })
                }
            }
            if (clue != null) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (d in YajilixEngine.Dir.entries) {
                        FilterChip(selected = clue.dir == d, onClick = { onChange { YajilixAuthoring.setDir(it, r, c, d) } },
                            label = { Text(d.arrow) })
                    }
                    TextButton(onClick = { onChange { YajilixAuthoring.stepNum(it, r, c, -1) } }, enabled = clue.num > 0) {
                        Icon(Icons.Filled.Remove, contentDescription = "Number down")
                    }
                    Text(clue.num.toString(), modifier = Modifier.align(Alignment.CenterVertically))
                    TextButton(onClick = { onChange { YajilixAuthoring.stepNum(it, r, c, 1) } }) {
                        Icon(Icons.Filled.Add, contentDescription = "Number up")
                    }
                }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(YajilixAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(YajilixAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(YajilixAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(YajilixAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last column")
            }
        }
    }
}
