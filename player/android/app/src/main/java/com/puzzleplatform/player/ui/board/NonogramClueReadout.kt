package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.NonogramEngine
import com.puzzleplatform.player.puzzle.NonogramHinter

/**
 * The whole of one Nonogram clue at a reading size, for lines too long to read in their
 * band (a 175-wide board's rows): "Row 37: 12 13 4 5 21 ...", wrapping as needed. Each
 * number is toned like the band draws it (greyed once satisfied, red in error with
 * [liveValidate] on), so the player can tick through it while painting that line. It
 * stays up while they paint and goes when they tap another clue or close it.
 */
@Composable
fun NonogramClueReadout(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    liveValidate: Boolean,
    line: NonogramHinter.Line,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val clues = remember(puzzle.id) { NonogramEngine.parseClues(puzzle) }
    val numbers = (if (line.isRow) clues.rowClues else clues.colClues).getOrNull(line.index) ?: return
    val tones = nonogramClueTones(puzzle, userValues, liveValidate, line)
    val colors = MaterialTheme.colorScheme
    val text = buildAnnotatedString {
        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
            append(if (line.isRow) "Row ${line.index + 1}:" else "Column ${line.index + 1}:")
        }
        if (numbers.isEmpty()) append("  0")
        numbers.forEachIndexed { i, n ->
            append("  ")
            val style = when (tones.getOrNull(i)) {
                ClueTone.SATISFIED -> SpanStyle(color = colors.onSurface.copy(alpha = 0.35f))
                ClueTone.ERROR -> SpanStyle(color = colors.error, fontWeight = FontWeight.Bold)
                else -> SpanStyle(color = colors.onSurface, fontWeight = FontWeight.Bold)
            }
            withStyle(style) { append(n.toString()) }
        }
    }
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = colors.surfaceVariant),
    ) {
        Row(
            Modifier.padding(start = 12.dp, top = 4.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text, fontSize = 16.sp, lineHeight = 24.sp, modifier = Modifier.weight(1f).padding(vertical = 6.dp))
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = "Close clue", modifier = Modifier.size(20.dp))
            }
        }
    }
}
