package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Bottom keypad for puzzles whose cell values can run past 9 (Fillomino room sizes,
 * Ripple Effect values). Same footprint as [DigitBar] — 46dp keys in a flowing row,
 * two rows on a phone — with a 0 key: 1-9, 0, ✕, ↩. It's kept that short on purpose
 * so it covers as little of the board as possible; there's no readout row because the
 * selected cell already shows the number as it's typed (1 then 2 -> 12; the next digit
 * appends until the cell is cleared or reselected).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NumberPad(
    onDigit: (Int) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier
            .fillMaxWidth()
            // Same inset handling as DigitBar: keep the pad above the gesture bar.
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val keys = (1..9).map { it.toString() } + listOf("0", "✕", "↩")
        for (key in keys) {
            OutlinedButton(
                onClick = {
                    when (key) {
                        "✕" -> onClear()
                        "↩" -> onDismiss()
                        else -> onDigit(key.toInt())
                    }
                },
                modifier = Modifier.size(46.dp),
                // Zero the default 24dp content padding so the label fits the 46dp key.
                contentPadding = PaddingValues(0.dp),
            ) {
                Text(key, fontSize = if (key.length == 1 && key[0].isDigit()) 18.sp else 16.sp)
            }
        }
    }
}
