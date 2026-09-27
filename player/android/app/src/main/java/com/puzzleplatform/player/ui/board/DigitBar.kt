package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Bottom digit entry bar for number puzzles, the Compose analog of
 * frontend/src/components/DigitBar.tsx. Digits 1-9 plus clear (✕) and dismiss (↩).
 *
 * When [onToggleNoteMode] is provided, an extra "123" button toggles pencil-mark
 * (note) entry; it's disabled via [noteModeDisabled] when the selected cell holds
 * a committed answer.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DigitBar(
    onDigit: (Int) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    noteMode: Boolean = false,
    onToggleNoteMode: (() -> Unit)? = null,
    noteModeDisabled: Boolean = false,
) {
    FlowRow(
        modifier = modifier
            .fillMaxWidth()
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // OutlinedButton's default content padding (24dp horizontal) would leave
        // no room for the label inside a fixed 46dp button and clip the digit to
        // nothing. Zero it out so the number is centered and visible.
        val noPadding = PaddingValues(0.dp)
        for (d in 1..9) {
            OutlinedButton(
                onClick = { onDigit(d) },
                modifier = Modifier.size(46.dp),
                contentPadding = noPadding,
            ) {
                Text(d.toString(), fontSize = 18.sp)
            }
        }
        if (onToggleNoteMode != null) {
            if (noteMode) {
                Button(
                    onClick = onToggleNoteMode,
                    enabled = !noteModeDisabled,
                    modifier = Modifier.size(46.dp),
                    contentPadding = noPadding,
                ) {
                    Text("123", fontSize = 13.sp)
                }
            } else {
                OutlinedButton(
                    onClick = onToggleNoteMode,
                    enabled = !noteModeDisabled,
                    modifier = Modifier.size(46.dp),
                    contentPadding = noPadding,
                ) {
                    Text("123", fontSize = 13.sp)
                }
            }
        }
        OutlinedButton(
            onClick = onClear,
            modifier = Modifier.size(46.dp),
            contentPadding = noPadding,
        ) {
            Text("✕", fontSize = 16.sp)
        }
        OutlinedButton(
            onClick = onDismiss,
            modifier = Modifier.size(46.dp),
            contentPadding = noPadding,
        ) {
            Text("↩", fontSize = 16.sp)
        }
    }
}
