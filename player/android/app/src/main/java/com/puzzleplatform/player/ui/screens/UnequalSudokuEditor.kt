package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.UnequalSudokuAuthoring
import com.puzzleplatform.player.puzzle.UnequalSudokuDraft
import com.puzzleplatform.player.ui.board.DigitBar
import com.puzzleplatform.player.ui.board.UnequalSudokuBoard

/**
 * Review body for a parsed unequal sudoku, the Android analog of the web
 * UnequalSudokuEditor: the player board laid out like the print, with every cell
 * editable (tap a cell, then a digit) and every gap tappable (cycles its sign
 * none -> < -> > -> none, ∧ / ∨ in vertical gaps). Givens that repeat a digit or break
 * a sign show red (live validation is on), and the misread warnings are listed above.
 */
@Composable
fun UnequalSudokuEditor(
    draft: UnequalSudokuDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((UnequalSudokuDraft) -> UnequalSudokuDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (problem in UnequalSudokuAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        UnequalSudokuBoard(
            puzzle = UnequalSudokuAuthoring.previewPuzzle(draft),
            userValues = draft.givens,
            liveValidate = true,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onTapGap = { gap -> onChange { UnequalSudokuAuthoring.cycleSign(it, gap) } },
        )
        Text(
            "Tap a cell to fix its digit. Tap the gap between two cells to cycle its sign: " +
                "none → < → > (∧ → ∨ between rows).",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (selectedCell != null) {
            DigitBar(
                onDigit = { digit -> onChange { UnequalSudokuAuthoring.setGiven(it, selectedCell, digit) } },
                onClear = { onChange { UnequalSudokuAuthoring.setGiven(it, selectedCell, null) } },
                onDismiss = { onSelectCell(null) },
            )
        }
    }
}
