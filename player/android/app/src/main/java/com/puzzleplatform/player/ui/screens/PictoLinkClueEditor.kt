package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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
import com.puzzleplatform.player.puzzle.PictoLinkAuthoring
import com.puzzleplatform.player.puzzle.PictoLinkDraft
import com.puzzleplatform.player.ui.board.PictoLinkBoard

/**
 * Review body for a parsed picto link, the Android analog of the web PictoLinkEditor: the
 * clue grid on the player board (tap a cell to select it), any problems that can't be
 * right, and a panel for the selected cell — type its clue (blank for none), or delete
 * its row/column (a parser's phantom line). Add row/column append a blank line for one
 * the parser missed. Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PictoLinkClueEditor(
    draft: PictoLinkDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((PictoLinkDraft) -> PictoLinkDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val clue = if (selCol != null && selRow != null) draft.cellAt(selCol, selRow) else null

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in PictoLinkAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            PictoLinkBoard(
                puzzle = PictoLinkAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onApplyChanges = {},
                selectedCell = selectedCell?.takeIf { clue != null },
                onSelectCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
            )
        }

        if (clue == null || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            // Re-key per cell so each selection starts its field from that cell's clue.
            key(selCol, selRow) {
                ClueNumberField(
                    label = "Path length (blank for none)",
                    clue = clue.takeIf { it != PictoLinkAuthoring.BLANK },
                    parse = PictoLinkAuthoring::parseClue,
                    onClue = { v -> onChange { PictoLinkAuthoring.setClue(it, selCol, selRow, v) } },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { PictoLinkAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { PictoLinkAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(PictoLinkAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(PictoLinkAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
