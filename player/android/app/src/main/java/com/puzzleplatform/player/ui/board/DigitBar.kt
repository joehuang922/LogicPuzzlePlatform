package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DigitBar(
    onDigit: (Int) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
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
