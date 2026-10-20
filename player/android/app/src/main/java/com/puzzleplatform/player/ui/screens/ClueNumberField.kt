package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType

/**
 * A clue as a number field for the Admin review editors; blank means no clue. The typed
 * text is kept locally and only re-synced when [clue] changes underneath it. [parse] is
 * the type's own text -> clue rule.
 */
@Composable
internal fun ClueNumberField(
    label: String,
    clue: Int?,
    parse: (String) -> Int?,
    onClue: (Int?) -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
) {
    var text by remember { mutableStateOf(clue?.toString() ?: "") }
    LaunchedEffect(clue) {
        if (parse(text) != clue) text = clue?.toString() ?: ""
    }
    OutlinedTextField(
        value = text,
        onValueChange = {
            text = it.filter { ch -> ch.isDigit() }.take(3)
            onClue(parse(text))
        },
        label = { Text(label) },
        singleLine = true,
        isError = isError,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}
