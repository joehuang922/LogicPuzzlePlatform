package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Bottom keypad for puzzles whose cell values can run past 9 (Fillomino room sizes,
 * Ripple Effect values). Laid out like a phone keypad — 1-3 / 4-6 / 7-9, then
 * ✕ 0 ↩ — so it reads as something you type a number on, not a row of one-digit
 * chips. A readout above the keys shows the selected cell's number, with a cursor
 * while [typing] (the next digit appends: 1 then 2 -> 12).
 */
@Composable
fun NumberPad(
    value: Int,
    typing: Boolean,
    onDigit: (Int) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            // Same inset handling as DigitBar: keep the pad above the gesture bar.
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.widthIn(max = 300.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            val readout = when {
                typing -> "$value▏"
                value > 0 -> value.toString()
                else -> "–"
            }
            Text(readout, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
            Text(
                if (typing) "Keep typing for more digits" else "Type a number (10+ OK)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val rows = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9"),
            listOf("✕", "0", "↩"),
        )
        for (keys in rows) {
            Row(
                modifier = Modifier.widthIn(max = 300.dp).fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (key in keys) {
                    OutlinedButton(
                        onClick = {
                            when (key) {
                                "✕" -> onClear()
                                "↩" -> onDismiss()
                                else -> onDigit(key.toInt())
                            }
                        },
                        modifier = Modifier.weight(1f).height(48.dp),
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text(key, fontSize = 20.sp)
                    }
                }
            }
        }
    }
}
