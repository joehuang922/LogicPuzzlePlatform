package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.IrregularNonogramAuthoring
import com.puzzleplatform.player.puzzle.IrregularNonogramEngine
import com.puzzleplatform.player.ui.board.IrregularNonogramBoard
import com.puzzleplatform.player.ui.board.NonogramMode

private val WARNING_MARK = Color(0xFFE69500)
private val PROBLEM_MARK = Color(0xFFCC3333)
private val WARNING_TEXT = Color(0xFFA66B00)

/**
 * Review body for a parsed irregular nonogram, the Android analog of the web
 * IrregularNonogramEditor: the draft on the player board, the format problems (which
 * block creating), the overridable warnings with their cells marked, and two modes —
 *  - Clues: tap a board cell to select its row and column pieces (highlighted), then
 *    type their clues ("2 5 1"; empty removes) and flip each clue's side;
 *  - Shape: tap a lattice cell to put it in or take it out of the board (the board
 *    grows into the ring of cells shown around it).
 * Two fingers still pan and zoom. Every edit goes straight to [onChange].
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun IrregularNonogramEditor(
    draft: IrregularNonogramEngine.Board,
    onChange: ((IrregularNonogramEngine.Board) -> IrregularNonogramEngine.Board) -> Unit,
) {
    var shapeMode by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var rowText by remember { mutableStateOf("") }
    var colText by remember { mutableStateOf("") }

    val sel = selected?.takeIf { (r, c) -> draft.isBoard(r, c) }
    val rowClue = sel?.let { (r, c) -> IrregularNonogramAuthoring.pieceClue(draft, "row", r, c) }
    val colClue = sel?.let { (r, c) -> IrregularNonogramAuthoring.pieceClue(draft, "col", r, c) }
    LaunchedEffect(sel, rowClue?.start, colClue?.start) {
        rowText = rowClue?.clues?.joinToString(" ") ?: ""
        colText = colClue?.clues?.joinToString(" ") ?: ""
    }

    val problems = IrregularNonogramEngine.formatProblems(draft)
    val warnings = IrregularNonogramEngine.warnings(draft)
    val marks = buildMap {
        for ((_, cells) in warnings) for (cell in cells) put(cell, WARNING_MARK)
        for ((_, cells) in problems) for (cell in cells) put(cell, PROBLEM_MARK)
    }
    val highlighted = buildSet {
        if (sel != null && !shapeMode) {
            for (axis in listOf("row", "col")) {
                IrregularNonogramEngine.segmentAt(draft, axis, sel.first, sel.second)?.let { addAll(it.cells()) }
            }
        }
    }

    fun apply(axis: String, text: String, side: String) {
        val (r, c) = sel ?: return
        val clues = IrregularNonogramAuthoring.parseClues(text) ?: return
        onChange { IrregularNonogramAuthoring.setPieceClue(it, axis, r, c, clues, side) }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${draft.rows} rows × ${draft.cols} columns, ${draft.clues.size} clues",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (problems.isNotEmpty()) {
            Text(
                "Fix before creating:",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.error,
            )
            for ((message, _) in problems) {
                Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
        for ((message, _) in warnings) {
            Text(message, style = MaterialTheme.typography.bodySmall, color = WARNING_TEXT)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = !shapeMode, onClick = { shapeMode = false }, label = { Text("Clues") })
            FilterChip(selected = shapeMode, onClick = { shapeMode = true; selected = null }, label = { Text("Shape") })
        }

        if (!shapeMode && sel != null) {
            for ((axis, label, sides) in listOf(
                Triple("row", "Row clue", listOf("start" to "Left", "end" to "Right")),
                Triple("col", "Column clue", listOf("start" to "Top", "end" to "Bottom")),
            )) {
                val clue = if (axis == "row") rowClue else colClue
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = if (axis == "row") rowText else colText,
                        onValueChange = { v ->
                            if (axis == "row") rowText = v else colText = v
                            apply(axis, v, clue?.side ?: "start")
                        },
                        label = { Text(label) },
                        singleLine = true,
                        modifier = Modifier.width(170.dp),
                    )
                    for ((side, name) in sides) {
                        FilterChip(
                            selected = clue?.side == side,
                            enabled = clue != null,
                            onClick = { apply(axis, if (axis == "row") rowText else colText, side) },
                            label = { Text(name) },
                        )
                    }
                }
            }
        }

        if (draft.rows > 0 && draft.cols > 0) {
            IrregularNonogramBoard(
                puzzle = IrregularNonogramAuthoring.previewPuzzle(draft),
                userValues = emptyMap(),
                mode = NonogramMode.FILL,
                onSetCell = { _, _, _ -> },
                onEditTap = { r, c ->
                    if (shapeMode) {
                        onChange { IrregularNonogramAuthoring.toggleCell(it, r, c) }
                    } else if (draft.isBoard(r, c)) {
                        selected = r to c
                    }
                },
                selected = highlighted,
                marks = marks,
                showLattice = shapeMode,
            )
        }
        Text(
            if (shapeMode) "Tap a cell to add it to the board or take it out."
            else "Tap a board cell, then type its row and column clues (space separated; empty removes).",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
