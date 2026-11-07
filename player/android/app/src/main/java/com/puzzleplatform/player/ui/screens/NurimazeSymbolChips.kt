package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.puzzleplatform.player.puzzle.NurimazeAuthoring
import com.puzzleplatform.player.puzzle.RippleEffectDraft

/**
 * Nurimaze's cell editor inside [RippleEffectRoomEditor]: one chip per symbol plus
 * "None"; the selected chip is the cell's symbol. Picking S or G doesn't clear another
 * one elsewhere — a second start/goal is listed as a problem instead.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun NurimazeSymbolChips(
    draft: RippleEffectDraft,
    col: Int,
    row: Int,
    onChange: ((RippleEffectDraft) -> RippleEffectDraft) -> Unit,
) {
    val current = draft.clues[row to col]
    Text("Symbol", style = MaterialTheme.typography.bodySmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(
            selected = current == null,
            onClick = { onChange { NurimazeAuthoring.setSymbol(it, col, row, null) } },
            label = { Text("None") },
        )
        for (symbol in NurimazeAuthoring.SYMBOLS) {
            FilterChip(
                selected = current == symbol,
                onClick = { onChange { NurimazeAuthoring.setSymbol(it, col, row, symbol) } },
                label = { Text(NurimazeAuthoring.symbolText(symbol)) },
            )
        }
    }
}
