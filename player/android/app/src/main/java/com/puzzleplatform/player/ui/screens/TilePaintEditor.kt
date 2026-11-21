package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.puzzleplatform.player.puzzle.TilePaintAuthoring
import com.puzzleplatform.player.puzzle.TilePaintEngine
import com.puzzleplatform.player.ui.board.TilePaintBoard
import com.puzzleplatform.player.ui.board.wallKeyAt
import kotlin.math.floor

private enum class TilePaintMode { WALLS, CLUES }

/**
 * Review body for a parsed Tile Paint board, the Android analog of the web
 * TilePaintEditor: the draft on the player board, its problems (marked on the board too),
 * and two modes — Walls (a tap snaps to the nearest interior edge and toggles the wall,
 * between two tile cells only) and Clues (tap a cell to select it; toggle it between tile
 * and clue cell and type a clue cell's right / down numbers, blank for none). Rows and
 * columns are added or removed at the bottom/right edge. Edits never refuse a layout;
 * format problems are listed and block creating.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TilePaintEditor(
    draft: TilePaintEngine.Board,
    onChange: ((TilePaintEngine.Board) -> TilePaintEngine.Board) -> Unit,
) {
    var mode by remember { mutableStateOf(TilePaintMode.WALLS) }
    var selected by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val sel = selected?.takeIf { (r, c) -> r in 0 until draft.rows && c in 0 until draft.cols }
    val format = TilePaintAuthoring.formatProblemCells(draft)
    val warnings = if (format.isEmpty()) TilePaintAuthoring.warningCells(draft) else emptyList()

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns (clue strips included), " +
                "${TilePaintEngine.tiles(draft).second} tiles, ${TilePaintEngine.runs(draft).size} clue numbers",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (format.isNotEmpty()) {
            Text(
                "Fix before creating — walls close off tiles, every number has cells to count:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (p in TilePaintAuthoring.problems(draft)) {
            Text(p, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((m, label) in listOf(TilePaintMode.WALLS to "Walls", TilePaintMode.CLUES to "Clues")) {
                FilterChip(
                    selected = mode == m,
                    onClick = {
                        mode = m
                        selected = null
                    },
                    label = { Text(label) },
                )
            }
        }

        if (draft.rows >= 2 && draft.cols >= 2) {
            TilePaintBoard(
                puzzle = TilePaintAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onEditTap = { x, y ->
                    when (mode) {
                        TilePaintMode.WALLS -> wallKeyAt(x, y, draft.rows, draft.cols)?.let { k ->
                            onChange { TilePaintAuthoring.toggleWall(it, k) }
                        }
                        TilePaintMode.CLUES -> {
                            val cell = floor(y).toInt() to floor(x).toInt()
                            selected = if (selected == cell) null else cell
                        }
                    }
                },
                selectedCell = sel.takeIf { mode == TilePaintMode.CLUES },
                problemCells = (format + warnings).map { it.r to it.c }.toSet(),
            )
        }

        when (mode) {
            TilePaintMode.WALLS -> Hint("Tap a line between two tile cells to toggle its wall.")
            TilePaintMode.CLUES -> if (sel == null) {
                Hint("Tap a cell to select it.")
            } else {
                val (r, c) = sel
                val clue = draft.cells[r][c]
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Row ${r + 1}, column ${c + 1}", fontWeight = FontWeight.Medium)
                }
                OutlinedButton(onClick = { onChange { TilePaintAuthoring.toggleClueCell(it, r, c) } }) {
                    Text(if (clue == null) "Make clue cell" else "Make tile cell")
                }
                if (clue != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        key(r, c, "right") {
                            ClueNumberField(
                                label = "Right (blank: none)",
                                clue = clue.right,
                                parse = TilePaintAuthoring::parseNumber,
                                onClue = { v -> onChange { TilePaintAuthoring.setNumber(it, r, c, true, v) } },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        key(r, c, "down") {
                            ClueNumberField(
                                label = "Down (blank: none)",
                                clue = clue.down,
                                parse = TilePaintAuthoring::parseNumber,
                                onClue = { v -> onChange { TilePaintAuthoring.setNumber(it, r, c, false, v) } },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(TilePaintAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(TilePaintAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(TilePaintAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(TilePaintAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
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
