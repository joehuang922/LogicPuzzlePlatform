package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure helpers for authoring a nurimaze question in the Admin screen, the analog of
 * frontend/src/components/NurimazeEditor.tsx. The parser returns the canon
 * `{ cells, grids: { h, v } }`; the review step fixes mis-read walls and symbols and
 * phantom/missed lines.
 *
 * The layout is a [RippleEffectDraft] whose clues are the cell symbols ([CIRCLE],
 * [TRIANGLE], [START], [GOAL]); walls, rows and columns are edited with
 * [RippleEffectAuthoring]. A wall that ends inside a room is a [formatProblems] entry and
 * a hard block on creating the question, which the server enforces too. [problems] adds
 * what can't be right on its face — not exactly one start and one goal — which the admin
 * may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object NurimazeAuthoring {

    const val PUZZLE_TYPE = 3

    const val CIRCLE = 1
    const val TRIANGLE = 2
    const val START = 3
    const val GOAL = 4

    /** Every symbol, in the order the editor offers them. */
    val SYMBOLS = listOf(START, GOAL, CIRCLE, TRIANGLE)

    /** How a symbol is shown on the board and in the editor. */
    fun symbolText(symbol: Int): String = when (symbol) {
        CIRCLE -> "○"
        TRIANGLE -> "△"
        START -> "S"
        GOAL -> "G"
        else -> "?"
    }

    /** Read a parser canon into a draft: ragged or missing grids read as no wall, unknown symbols as none. */
    fun draftFromCanon(canon: JsonObject): RippleEffectDraft {
        val cells = WallRoomsAuthoring.intGrid(canon["cells"])
        val grids = canon["grids"] as? JsonObject
        val height = cells.size
        val width = cells.maxOfOrNull { it.size } ?: 0
        val draft = WallRoomsAuthoring.wallDraft(
            width,
            height,
            WallRoomsAuthoring.intGrid(grids?.get("h")),
            WallRoomsAuthoring.intGrid(grids?.get("v")),
        )
        if (draft.width <= 0) return draft
        val clues = mutableMapOf<Pair<Int, Int>, Int>()
        for (r in 0 until height) for (c in 0 until width) {
            val v = cells[r].getOrNull(c) ?: 0
            if (v in SYMBOLS) clues[r to c] = v
        }
        return draft.copy(clues = clues)
    }

    /** The canon `{ cells, grids: { h, v } }` to POST. */
    fun canonFromDraft(draft: RippleEffectDraft): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(List(draft.height) { r ->
                JsonArray(List(draft.width) { c -> JsonPrimitive(draft.clues[r to c] ?: 0) })
            }),
            "grids" to WallRoomsAuthoring.wallGrids(draft),
        )
    )

    /** Set the symbol of (col, row); null clears it. */
    fun setSymbol(draft: RippleEffectDraft, col: Int, row: Int, symbol: Int?): RippleEffectDraft =
        RippleEffectAuthoring.setClue(draft, col, row, symbol?.takeIf { it in SYMBOLS })

    /** What keeps the draft from being a layout: no cells, or a wall that ends inside a room. */
    fun formatProblems(draft: RippleEffectDraft): List<String> = RippleEffectAuthoring.formatProblems(draft)

    /** Every issue: the [formatProblems], then a missing or repeated start or goal. Empty when clean. */
    fun problems(draft: RippleEffectDraft): List<String> = formatProblems(draft) + buildList {
        if (draft.width <= 0 || draft.height <= 0) return@buildList
        for ((symbol, name) in listOf(START to "start (S)", GOAL to "goal (G)")) {
            val count = draft.clues.values.count { it == symbol }
            if (count == 0) add("No $name")
            if (count > 1) add("$count cells are the $name; there must be one")
        }
    }
}
