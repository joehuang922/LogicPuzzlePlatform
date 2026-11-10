package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
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
 * frontend/src/components/DigitBar.tsx. Digits 1-[max] (default 9; up to 30 on a big
 * sudoku, where the bar wraps into a pad of smaller buttons) plus clear (✕) and
 * dismiss (↩). Digits in [marked] (the selected cell's pencil marks) show filled.
 *
 * When [onToggleNoteMode] is provided, an extra "123" button toggles pencil-mark
 * (note) entry; it's disabled via [noteModeDisabled] when the selected cell holds
 * a committed answer.
 *
 * Puzzles whose values can be multi-digit use [NumberPad] instead.
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
    max: Int = 9,
    marked: Set<Int> = emptySet(),
) {
    val button = if (max > 9) 40.dp else 46.dp
    FlowRow(
        modifier = modifier
            .fillMaxWidth()
            // Lift the pad clear of the system gesture/navigation bar at the
            // screen's bottom edge; without consuming this inset the pad draws
            // into the gesture-pill zone and sits uncomfortably low. The extra
            // bottom padding adds a little breathing room above that inset.
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // OutlinedButton's default content padding (24dp horizontal) would leave
        // no room for the label inside a fixed 46dp button and clip the digit to
        // nothing. Zero it out so the number is centered and visible.
        val noPadding = PaddingValues(0.dp)
        for (d in 1..max) {
            if (d in marked) {
                Button(onClick = { onDigit(d) }, modifier = Modifier.size(button), contentPadding = noPadding) {
                    Text(d.toString(), fontSize = if (max > 9) 15.sp else 18.sp)
                }
            } else {
                OutlinedButton(onClick = { onDigit(d) }, modifier = Modifier.size(button), contentPadding = noPadding) {
                    Text(d.toString(), fontSize = if (max > 9) 15.sp else 18.sp)
                }
            }
        }
        if (onToggleNoteMode != null) {
            if (noteMode) {
                Button(
                    onClick = onToggleNoteMode,
                    enabled = !noteModeDisabled,
                    modifier = Modifier.size(button),
                    contentPadding = noPadding,
                ) {
                    Text("123", fontSize = 13.sp)
                }
            } else {
                OutlinedButton(
                    onClick = onToggleNoteMode,
                    enabled = !noteModeDisabled,
                    modifier = Modifier.size(button),
                    contentPadding = noPadding,
                ) {
                    Text("123", fontSize = 13.sp)
                }
            }
        }
        OutlinedButton(
            onClick = onClear,
            modifier = Modifier.size(button),
            contentPadding = noPadding,
        ) {
            Text("✕", fontSize = 16.sp)
        }
        OutlinedButton(
            onClick = onDismiss,
            modifier = Modifier.size(button),
            contentPadding = noPadding,
        ) {
            Text("↩", fontSize = 16.sp)
        }
    }
}
