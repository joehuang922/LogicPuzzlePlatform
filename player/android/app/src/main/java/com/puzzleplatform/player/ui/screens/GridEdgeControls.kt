package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * The admin editors' resize controls: add a row at the top or bottom and a column at the
 * left or right, since a parser can miss a line on any side. Editors that delete a line by
 * selecting a cell in it pass only the adds. Resize-only editors also pass [onRemoveRow] /
 * [onRemoveCol] (true = top / left), turned off by [canRemoveRow] / [canRemoveCol] at the
 * type's minimum size. Types whose first line is special (clue lines, irregular shapes) keep
 * their own bottom / right controls; see puzzle/GridEdges.kt.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GridEdgeControls(
    onAddRow: (top: Boolean) -> Unit,
    onAddCol: (left: Boolean) -> Unit,
    onRemoveRow: ((top: Boolean) -> Unit)? = null,
    onRemoveCol: ((left: Boolean) -> Unit)? = null,
    canRemoveRow: Boolean = true,
    canRemoveCol: Boolean = true,
) {
    Column {
        EdgeLine("Row", "Top", "Bottom", onAddRow, onRemoveRow, canRemoveRow)
        EdgeLine("Column", "Left", "Right", onAddCol, onRemoveCol, canRemoveCol)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EdgeLine(
    label: String,
    start: String,
    end: String,
    onAdd: (atStart: Boolean) -> Unit,
    onRemove: ((atStart: Boolean) -> Unit)?,
    canRemove: Boolean,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.align(Alignment.CenterVertically),
        )
        for ((atStart, side) in listOf(true to start, false to end)) {
            TextButton(onClick = { onAdd(atStart) }) {
                Icon(Icons.Filled.Add, contentDescription = "Add $label $side".lowercase())
                Text(side)
            }
        }
        if (onRemove != null) {
            for ((atStart, side) in listOf(true to start, false to end)) {
                TextButton(onClick = { onRemove(atStart) }, enabled = canRemove) {
                    Icon(Icons.Filled.Remove, contentDescription = "Remove $label $side".lowercase())
                    Text(side)
                }
            }
        }
    }
}
