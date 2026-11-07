package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.puzzleplatform.player.puzzle.NuritwinAuthoring
import com.puzzleplatform.player.puzzle.RippleEffectAuthoring
import com.puzzleplatform.player.puzzle.RippleEffectDraft

/**
 * Nuritwin's cell editor inside [RippleEffectRoomEditor]: the room number on this cell
 * (each of the room's two shaded groups has that many cells), red when two such groups
 * can't fit in the room.
 */
@Composable
internal fun NuritwinClueField(
    draft: RippleEffectDraft,
    col: Int,
    row: Int,
    onChange: ((RippleEffectDraft) -> RippleEffectDraft) -> Unit,
) {
    val roomSize = draft.regionAt(col, row)?.size ?: 0
    val clue = draft.clues[row to col]
    ClueNumberField(
        label = "Group size (blank for none)",
        clue = clue,
        parse = RippleEffectAuthoring::parseClue,
        onClue = { v -> onChange { RippleEffectAuthoring.setClue(it, col, row, v) } },
        isError = (clue ?: 0) > NuritwinAuthoring.maxClue(roomSize),
        modifier = Modifier.fillMaxWidth(),
    )
}
