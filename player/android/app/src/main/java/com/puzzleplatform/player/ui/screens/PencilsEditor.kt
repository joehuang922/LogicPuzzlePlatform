package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.ClueGridDraft
import com.puzzleplatform.player.puzzle.PencilsAuthoring
import com.puzzleplatform.player.puzzle.PencilsRules
import com.puzzleplatform.player.ui.board.PencilsBoard
import com.puzzleplatform.player.ui.board.drawPencilHead

/**
 * Review body for a parsed Pencils, the Android analog of the web PencilsEditor: the
 * shared [ClueGridEditor] (type a number, delete/add rows and columns) plus chips that
 * make the selected cell a head pointing up / down / left / right. Typing a number
 * replaces a head; picking a head replaces a number.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PencilsEditor(
    draft: ClueGridDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((ClueGridDraft) -> ClueGridDraft) -> Unit,
) {
    ClueGridEditor(
        authoring = PencilsAuthoring,
        draft = draft,
        clueLabel = "Number",
        selectedCell = selectedCell,
        onSelectCell = onSelectCell,
        onChange = onChange,
        cellExtras = { col, row ->
            val value = draft.cellAt(col, row)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((dir, name) in PencilsRules.HEADS) {
                    FilterChip(
                        selected = value == dir,
                        onClick = {
                            onChange { PencilsAuthoring.setClue(it, col, row, if (value == dir) 0 else dir) }
                        },
                        label = { Text("Head $name") },
                        leadingIcon = {
                            Canvas(Modifier.size(18.dp)) { drawPencilHead(dir, center, size.minDimension) }
                        },
                    )
                }
            }
        },
    ) { puzzle, onTap, selected ->
        // Nothing is drawn here, so the board's own input is off.
        PencilsBoard(
            puzzle = puzzle,
            userValues = emptyMap(),
            onApplyChanges = {},
            readOnly = true,
            onTapCell = onTap,
            selectedCell = selected,
        )
    }
}
