package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.ClueGridDraft
import com.puzzleplatform.player.puzzle.HellGolfAuthoring
import com.puzzleplatform.player.ui.board.HellGolfBoard

/**
 * Review body for a parsed Hell Golf, the Android analog of the web HellGolfEditor: the
 * shared [ClueGridEditor] (type a ball's number, delete/add rows and columns) plus chips
 * that make the selected cell a lake or a goal. A cell holds one thing, so typing a number
 * replaces a lake or goal, and picking one replaces a ball; picking the chip that's already
 * on clears the cell.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HellGolfEditor(
    draft: ClueGridDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((ClueGridDraft) -> ClueGridDraft) -> Unit,
) {
    ClueGridEditor(
        authoring = HellGolfAuthoring,
        draft = draft,
        clueLabel = "Ball number",
        selectedCell = selectedCell,
        onSelectCell = onSelectCell,
        onChange = onChange,
        cellExtras = { col, row ->
            val value = draft.cellAt(col, row)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((code, name) in listOf(HellGolfAuthoring.LAKE to "Lake", HellGolfAuthoring.GOAL to "Goal (H)")) {
                    FilterChip(
                        selected = value == code,
                        onClick = {
                            onChange { HellGolfAuthoring.setClue(it, col, row, if (value == code) 0 else code) }
                        },
                        label = { Text(name) },
                    )
                }
            }
        },
    ) { puzzle, onTap, selected ->
        // Every tap edits; the board's ball moves are off.
        HellGolfBoard(
            puzzle = puzzle,
            userValues = emptyMap(),
            onPutValue = { _, _ -> },
            onEditTap = onTap,
            selectedCell = selected,
        )
    }
}
