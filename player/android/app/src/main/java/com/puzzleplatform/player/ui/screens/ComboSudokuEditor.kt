package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.ComboSudokuAuthoring
import com.puzzleplatform.player.puzzle.ComboSudokuDraft
import com.puzzleplatform.player.ui.board.ComboSudokuBoard
import com.puzzleplatform.player.ui.board.DigitBar

/**
 * Review body for a parsed combo sudoku: the player's [ComboSudokuBoard] with every
 * given editable (tap a cell, then a digit — it's written to every board covering the
 * cell), conflicts in red, and the layout tools for a board the parser placed wrong:
 * pick a board (outlined in amber), move it a room at a time, remove it, or add an
 * empty one. Format problems (no board, stacked boards, overlaps that disagree) block
 * creating; repeated digits are listed as overridable misread warnings.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ComboSudokuEditor(
    draft: ComboSudokuDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((ComboSudokuDraft) -> ComboSudokuDraft) -> Unit,
) {
    var focus by remember { mutableStateOf<Int?>(null) }
    val focused = focus?.takeIf { it in draft.subboards.indices }
    val formatProblems = ComboSudokuAuthoring.formatProblems(draft)
    val layout = draft.layout

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.subboards.size} boards, ${layout.rows} rows × ${layout.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (formatProblems.isNotEmpty()) {
            Text(
                "Fix before creating:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
            for (problem in formatProblems) {
                Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
        for (problem in ComboSudokuAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.subboards.isNotEmpty()) {
            val reviewPuzzle = remember(draft.subboards.map { it.x to it.y }) {
                ComboSudokuAuthoring.reviewPuzzle(draft)
            }
            ComboSudokuBoard(
                puzzle = reviewPuzzle,
                userValues = ComboSudokuAuthoring.givens(draft),
                liveValidate = true,
                selectedCell = selectedCell?.takeIf { it in layout.cells },
                onSelectCell = onSelectCell,
                focusBoard = focused,
            )
        }

        val cell = selectedCell?.takeIf { it in layout.cells }?.split(",")?.map { it.toInt() }
        if (cell != null) {
            val (col, row) = cell
            Text("Row ${row + 1}, column ${col + 1}", fontWeight = FontWeight.Medium)
            DigitBar(
                onDigit = { d -> if (d in 1..9) onChange { it.withCell(col, row, d) } },
                onClear = { onChange { it.withCell(col, row, 0) } },
                onDismiss = { onSelectCell(null) },
            )
        } else {
            Text(
                "Tap a cell to fix its digit, or pick a board to move it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            draft.subboards.forEachIndexed { i, _ ->
                FilterChip(
                    selected = focused == i,
                    onClick = { focus = if (focused == i) null else i },
                    label = { Text("Board ${i + 1}") },
                )
            }
            TextButton(onClick = {
                onSelectCell(null)
                focus = draft.subboards.size
                onChange { it.withNewBoard() }
            }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add board")
            }
        }
        if (focused != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((label, dx, dy) in listOf(Triple("←", -1, 0), Triple("→", 1, 0), Triple("↑", 0, -1), Triple("↓", 0, 1))) {
                    OutlinedButton(onClick = {
                        onSelectCell(null)
                        onChange { it.moved(focused, dx, dy) }
                    }) { Text(label) }
                }
                OutlinedButton(onClick = {
                    onSelectCell(null)
                    focus = null
                    onChange { it.withoutBoard(focused) }
                }) { Text("Remove board ${focused + 1}") }
            }
        }
    }
}
