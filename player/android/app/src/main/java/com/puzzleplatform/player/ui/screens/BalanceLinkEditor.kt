package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.BalanceLinkAuthoring
import com.puzzleplatform.player.puzzle.BalanceLinkRules
import com.puzzleplatform.player.puzzle.ClueGridDraft
import com.puzzleplatform.player.ui.board.BalanceLinkBoard
import com.puzzleplatform.player.ui.board.drawBalanceSymbol

/**
 * Review body for a parsed balance link, the Android analog of the web BalanceLinkEditor:
 * the board (tap a cell to select it), any warnings, and a panel for the selected cell —
 * make it empty or black, or pick a symbol's shape and colour; or delete its row/column
 * (a parser's phantom line). Add row/column append an empty line for one the parser
 * missed. Every edit goes straight to [onChange]; [selectedCell] is "col,row".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BalanceLinkEditor(
    draft: ClueGridDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((ClueGridDraft) -> ClueGridDraft) -> Unit,
) {
    val selected = selectedCell?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }
    val selCol = selected?.get(0)
    val selRow = selected?.get(1)
    val inGrid = selCol != null && selRow != null && draft.inGrid(selCol, selRow)
    val value = if (inGrid && selCol != null && selRow != null) draft.cellAt(selCol, selRow) else null
    // Colour a picked shape gets; follows the selected symbol.
    var blackSymbol by remember { mutableStateOf(false) }
    LaunchedEffect(selectedCell) {
        if (value != null && BalanceLinkRules.isSymbol(value)) blackSymbol = BalanceLinkRules.isBlackSymbol(value)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (problem in BalanceLinkAuthoring.problems(draft)) {
            Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        if (draft.rows > 0 && draft.cols > 0) {
            // No lines are drawn here, so the edge writes are dropped.
            BalanceLinkBoard(
                puzzle = BalanceLinkAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                onSetEdge = { _, _ -> },
                onTapCell = { col, row ->
                    val key = "$col,$row"
                    onSelectCell(if (selectedCell == key) null else key)
                },
                selectedCell = selectedCell?.takeIf { inGrid },
            )
        }

        if (value == null || selCol == null || selRow == null) {
            Text(
                "Tap a cell to edit it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("Row ${selRow + 1}, column ${selCol + 1}", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = value == BalanceLinkRules.EMPTY,
                    onClick = { onChange { BalanceLinkAuthoring.setCell(it, selCol, selRow, BalanceLinkRules.EMPTY) } },
                    label = { Text("Empty") },
                )
                FilterChip(
                    selected = value == BalanceLinkRules.BLACK,
                    onClick = { onChange { BalanceLinkAuthoring.setCell(it, selCol, selRow, BalanceLinkRules.BLACK) } },
                    label = { Text("Black cell") },
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((black, label) in listOf(false to "White symbol", true to "Black symbol")) {
                    FilterChip(
                        selected = blackSymbol == black,
                        onClick = {
                            blackSymbol = black
                            onChange { BalanceLinkAuthoring.setSymbolColour(it, selCol, selRow, black) }
                        },
                        label = { Text(label) },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((shape, name) in BalanceLinkRules.SHAPES) {
                    val code = BalanceLinkRules.code(shape, blackSymbol)
                    FilterChip(
                        selected = value == code,
                        onClick = { onChange { BalanceLinkAuthoring.setCell(it, selCol, selRow, code) } },
                        label = { Text(name) },
                        leadingIcon = {
                            Canvas(Modifier.size(18.dp)) {
                                drawBalanceSymbol(code, center, size.minDimension * 0.42f, 1.dp.toPx())
                            }
                        },
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { BalanceLinkAuthoring.removeRow(it, selRow) }
                    },
                    enabled = draft.rows > 1,
                ) { Text("Delete row ${selRow + 1}") }
                OutlinedButton(
                    onClick = {
                        onSelectCell(null)
                        onChange { BalanceLinkAuthoring.removeCol(it, selCol) }
                    },
                    enabled = draft.cols > 1,
                ) { Text("Delete column ${selCol + 1}") }
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton(onClick = { onChange(BalanceLinkAuthoring::addRow) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add row")
            }
            TextButton(onClick = { onChange(BalanceLinkAuthoring::addCol) }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Add column")
            }
        }
    }
}
