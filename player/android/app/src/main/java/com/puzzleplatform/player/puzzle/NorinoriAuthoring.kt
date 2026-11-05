package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure helpers for authoring a norinori question in the Admin screen, the analog of
 * frontend/src/components/NorinoriEditor.tsx. The parser returns the canon
 * `{ grids: { h, v } }` — only the room walls; the review step fixes mis-read walls and
 * phantom/missed lines.
 *
 * The layout is a [RippleEffectDraft] with no numbers: the same walls, and every wall /
 * row / column edit is [RippleEffectAuthoring]'s. A wall that ends inside a room is a
 * [formatProblems] entry: shown while editing, and a hard block on creating the
 * question, which the server enforces too. [problems] adds what can't be solved — a
 * one-cell room can't hold its two shaded cells — which the admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object NorinoriAuthoring {

    const val PUZZLE_TYPE = 23

    /** Read a parser canon into a draft (ragged or missing grids read as no wall). */
    fun draftFromCanon(canon: JsonObject): RippleEffectDraft {
        val grids = NorinoriEngine.parseGrids(
            Puzzle(
                id = "admin-norinori-draft",
                puzzleType = PUZZLE_TYPE,
                puzzleTypeName = "norinori",
                puzzleTypeJpLabel = "のりのり",
                difficulty = 1,
                canonRepr = canon,
            )
        )
        val height = maxOf(grids.h.size + 1, grids.v.size)
        val width = maxOf(grids.v.maxOfOrNull { it.size + 1 } ?: 0, grids.h.maxOfOrNull { it.size } ?: 0)
        if (grids.v.isEmpty() || width <= 0) return RippleEffectDraft()
        return RippleEffectDraft(
            width = width,
            height = height,
            hWalls = List(height - 1) { r -> List(width) { c -> grids.h.getOrNull(r)?.getOrNull(c) == 1 } },
            vWalls = List(height) { r -> List(width - 1) { c -> grids.v.getOrNull(r)?.getOrNull(c) == 1 } },
        )
    }

    /** The canon `{ grids: { h, v } }` to POST. */
    fun canonFromDraft(draft: RippleEffectDraft): JsonObject {
        fun grid(lines: List<List<Boolean>>) =
            JsonArray(lines.map { line -> JsonArray(line.map { JsonPrimitive(if (it) 1 else 0) }) })
        return JsonObject(
            mapOf("grids" to JsonObject(mapOf("h" to grid(draft.hWalls), "v" to grid(draft.vWalls))))
        )
    }

    /** What keeps the draft from being a norinori layout: no cells, or a wall that ends inside a room. */
    fun formatProblems(draft: RippleEffectDraft): List<String> = RippleEffectAuthoring.formatProblems(draft)

    /** Every issue: the [formatProblems], then rooms too small for their two shaded cells. Empty when clean. */
    fun problems(draft: RippleEffectDraft): List<String> = formatProblems(draft) + buildList {
        if (draft.width <= 0 || draft.height <= 0) return@buildList
        for (room in draft.regions()) {
            if (room.size < 2) add("Room at R${room[0].first + 1}C${room[0].second + 1} is one cell; it needs two shaded")
        }
    }
}
