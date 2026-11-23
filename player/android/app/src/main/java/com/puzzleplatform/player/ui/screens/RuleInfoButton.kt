package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.puzzleplatform.player.R

/**
 * Blue "i" button beside the play screen's type label. Tapping it floats a popup with
 * the type's [rule] just below the button; the popup's X (or Back) closes it. Shows
 * nothing when the type has no rule text. Mirrors the web's `RuleInfo`.
 */
@Composable
fun RuleInfoButton(typeLabel: String, rule: String?, modifier: Modifier = Modifier) {
    if (rule.isNullOrBlank()) return
    var open by remember { mutableStateOf(false) }
    // The popup hangs just below the button.
    val belowButton = with(LocalDensity.current) { 36.dp.roundToPx() }

    Box(modifier) {
        IconButton(onClick = { open = !open }, modifier = Modifier.size(32.dp)) {
            Icon(
                painter = painterResource(R.drawable.ic_rule_info),
                contentDescription = "Rules of $typeLabel",
                tint = Color.Unspecified,
                modifier = Modifier.size(22.dp),
            )
        }
        if (open) {
            Popup(
                alignment = Alignment.TopStart,
                offset = IntOffset(0, belowButton),
                onDismissRequest = { open = false },
                // Only the X (or Back) closes it; a tap elsewhere leaves it open.
                properties = PopupProperties(focusable = true, dismissOnClickOutside = false),
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    tonalElevation = 2.dp,
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.widthIn(max = 340.dp).heightIn(max = 420.dp),
                ) {
                    Box {
                        Column(
                            Modifier
                                .verticalScroll(rememberScrollState())
                                .padding(start = 16.dp, top = 14.dp, end = 16.dp, bottom = 16.dp),
                        ) {
                            Text(
                                typeLabel,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.padding(end = 32.dp, bottom = 6.dp),
                            )
                            Text(rule, style = MaterialTheme.typography.bodyMedium)
                        }
                        IconButton(
                            onClick = { open = false },
                            modifier = Modifier.align(Alignment.TopEnd).size(40.dp),
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "Close")
                        }
                    }
                }
            }
        }
    }
}
