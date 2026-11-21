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
import com.puzzleplatform.player.puzzle.CountryRoadAuthoring
import com.puzzleplatform.player.puzzle.CountryRoadEngine
import com.puzzleplatform.player.ui.board.CountryRoadBoard
import com.puzzleplatform.player.ui.board.wallKeyAt
import kotlin.math.floor

private enum class CountryRoadMode { WALLS, NUMBERS }

/**
 * Review body for a parsed Country Road board, the Android analog of the web
 * CountryRoadEditor: the draft on the player board, its problems (also marked on the
 * board), and two modes — Walls (a tap snaps to the nearest interior edge and toggles its
 * wall) and Numbers (tap a cell, type its number, blank for none). Rows and columns are
 * added or removed at the bottom/right edge. Edits never refuse a layout; format problems
 * are listed and block creating.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CountryRoadEditor(
    draft: CountryRoadEngine.Board,
    onChange: ((CountryRoadEngine.Board) -> CountryRoadEngine.Board) -> Unit,
) {
    var mode by remember { mutableStateOf(CountryRoadMode.WALLS) }
    var selected by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val sel = selected?.takeIf { (r, c) -> r in 0 until draft.rows && c in 0 until draft.cols }
    val format = CountryRoadAuthoring.formatProblemCells(draft)
    val warnings = if (format.isEmpty()) CountryRoadAuthoring.warningCells(draft) else emptyList()

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${CountryRoadEngine.rooms(draft).second} rooms, " +
                "${draft.cells.sumOf { row -> row.count { it > 0 } }} numbers",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (format.isNotEmpty()) {
            Text(
                "Fix before creating — walls close off rooms, one number per room:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        for (p in CountryRoadAuthoring.problems(draft)) {
            Text(p, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((m, label) in listOf(CountryRoadMode.WALLS to "Walls", CountryRoadMode.NUMBERS to "Numbers")) {
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
            CountryRoadBoard(
                puzzle = CountryRoadAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onTapCell = { _, _ -> },
                onApplyChanges = {},
                onEditTap = { x, y ->
                    when (mode) {
                        CountryRoadMode.WALLS -> wallKeyAt(x, y, draft.rows, draft.cols)?.let { k ->
                            onChange { CountryRoadAuthoring.toggleWall(it, k) }
                        }
                        CountryRoadMode.NUMBERS -> {
                            val cell = floor(y).toInt() to floor(x).toInt()
                            selected = if (selected == cell) null else cell
                        }
                    }
                },
                selectedCell = sel.takeIf { mode == CountryRoadMode.NUMBERS },
                problemCells = (format + warnings).map { it.r to it.c }.toSet(),
            )
        }

        when (mode) {
            CountryRoadMode.WALLS -> Hint("Tap a line between two cells to toggle a room wall.")
            CountryRoadMode.NUMBERS -> if (sel == null) {
                Hint("Tap a cell to edit its number.")
            } else {
                val (r, c) = sel
                Text("Row ${r + 1}, column ${c + 1}", fontWeight = FontWeight.Medium)
                key(r, c) {
                    ClueNumberField(
                        label = "Number (blank for none)",
                        clue = draft.number(r, c).takeIf { it > 0 },
                        parse = CountryRoadAuthoring::parseNumber,
                        onClue = { v -> onChange { CountryRoadAuthoring.setNumber(it, r, c, v) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(CountryRoadAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(CountryRoadAuthoring::removeLastRow) }, enabled = draft.rows > 2) {
                Icon(Icons.Filled.Remove, contentDescription = null)
                Text("Remove last row")
            }
            TextButton(onClick = { onChange(CountryRoadAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
            TextButton(onClick = { onChange(CountryRoadAuthoring::removeLastCol) }, enabled = draft.cols > 2) {
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
