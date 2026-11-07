package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a nuritwin question in the Admin screen, the analog of
 * frontend/src/components/NuritwinEditor.tsx. The parser returns the canon
 * `{ cells, grids: { h, v } }`; the review step fixes mis-read walls and numbers and
 * phantom/missed lines.
 *
 * The layout is a [RippleEffectDraft] whose clues are the room numbers (a room's N: each
 * of its two shaded groups has N cells); walls, rows and columns are edited with
 * [RippleEffectAuthoring]. A wall that ends inside a room is a [formatProblems] entry and
 * a hard block on creating the question, which the server enforces too. [problems] adds
 * what can't be right on its face, which the admin may override: a room too small for two
 * separate groups, a room with more than one number, and a number whose two groups
 * don't fit in its room.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object NuritwinAuthoring {

    const val PUZZLE_TYPE = 9

    /** Fewest cells a room can split into two separate shaded groups (e.g. ■□■). */
    const val MIN_ROOM = 3

    /** Read a parser canon into a draft (ragged or missing grids read as no wall). */
    fun draftFromCanon(canon: JsonObject): RippleEffectDraft =
        WallRoomsAuthoring.cellsAndWallsDraft(canon) { it > 0 }

    /** The canon `{ cells, grids: { h, v } }` to POST. */
    fun canonFromDraft(draft: RippleEffectDraft): JsonObject = WallRoomsAuthoring.cellsAndWallsCanon(draft)

    /** Largest N whose two N-cell groups fit in a room of [roomSize] cells. */
    fun maxClue(roomSize: Int): Int = roomSize / 2

    /** What keeps the draft from being a layout: no cells, or a wall that ends inside a room. */
    fun formatProblems(draft: RippleEffectDraft): List<String> = RippleEffectAuthoring.formatProblems(draft)

    /** Every issue: the [formatProblems], then rooms and numbers that can't be right. Empty when clean. */
    fun problems(draft: RippleEffectDraft): List<String> = formatProblems(draft) + buildList {
        if (draft.width <= 0 || draft.height <= 0) return@buildList
        for (room in draft.regions()) {
            val label = "R${room[0].first + 1}C${room[0].second + 1}"
            if (room.size < MIN_ROOM) add("Room at $label has ${room.size} cell${if (room.size == 1) "" else "s"}; it needs $MIN_ROOM for two groups")
            val clues = room.mapNotNull { draft.clues[it] }
            if (clues.size > 1) add("Room at $label has ${clues.size} numbers (${clues.joinToString(", ")})")
            for (n in clues.distinct()) {
                if (n > maxClue(room.size)) add("Room at $label: two groups of $n can't fit in ${room.size} cells")
            }
        }
    }
}
