package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** One on/off display aid in the play screen's Options menu. */
data class PlayOption(val label: String, val checked: Boolean, val onToggle: () -> Unit)

/**
 * The play screen's opt-in display aids (error highlighting, Nonogram coordinates, ...)
 * behind one "Options" button: a menu of switches that stays open while they're
 * flipped, so the input controls beside the board hold only input controls.
 */
@Composable
fun PlayOptionsMenu(options: List<PlayOption>, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }) {
            Icon(Icons.Outlined.Tune, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Options")
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (option in options) {
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = option.onToggle,
                    trailingIcon = { Switch(checked = option.checked, onCheckedChange = { option.onToggle() }) },
                )
            }
        }
    }
}
