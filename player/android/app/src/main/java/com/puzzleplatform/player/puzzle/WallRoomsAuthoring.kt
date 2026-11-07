package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Pure helpers for authoring a puzzle whose canon is only its room walls,
 * `{ grids: { h, v } }` (norinori, LITS) — the analog of the web NorinoriEditor /
 * LitsEditor. The review step fixes mis-read walls and phantom/missed lines.
 *
 * The layout is a [RippleEffectDraft] with no numbers: the same walls, and every wall /
 * row / column edit is [RippleEffectAuthoring]'s. A wall that ends inside a room is a
 * [formatProblems] entry: shown while editing, and a hard block on creating the
 * question, which the server enforces too. [problems] adds rooms smaller than
 * [minRoomSize], which can't hold what the type shades in each room ([needs]); the admin
 * may override those.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
open class WallRoomsAuthoring(
    private val minRoomSize: Int,
    private val needs: String,
) {

    /** Read a parser canon into a draft (ragged or missing grids read as no wall). */
    fun draftFromCanon(canon: JsonObject): RippleEffectDraft {
        val grids = canon["grids"] as? JsonObject
        val h = intGrid(grids?.get("h"))
        val v = intGrid(grids?.get("v"))
        if (v.isEmpty()) return RippleEffectDraft()
        val height = maxOf(h.size + 1, v.size)
        val width = maxOf(v.maxOf { it.size + 1 }, h.maxOfOrNull { it.size } ?: 0)
        return wallDraft(width, height, h, v)
    }

    /** The canon `{ grids: { h, v } }` to POST. */
    fun canonFromDraft(draft: RippleEffectDraft): JsonObject =
        JsonObject(mapOf("grids" to wallGrids(draft)))

    /** What keeps the draft from being a layout: no cells, or a wall that ends inside a room. */
    fun formatProblems(draft: RippleEffectDraft): List<String> = RippleEffectAuthoring.formatProblems(draft)

    /** Every issue: the [formatProblems], then rooms too small for what they must hold. Empty when clean. */
    fun problems(draft: RippleEffectDraft): List<String> = formatProblems(draft) + roomSizeProblems(draft)

    /** Rooms with fewer than [minRoomSize] cells. */
    fun roomSizeProblems(draft: RippleEffectDraft): List<String> = buildList {
        if (draft.width <= 0 || draft.height <= 0) return@buildList
        for (room in draft.regions()) {
            if (room.size >= minRoomSize) continue
            val cells = if (room.size == 1) "1 cell" else "${room.size} cells"
            add("Room at R${room[0].first + 1}C${room[0].second + 1} has $cells; it needs $needs")
        }
    }

    companion object {
        /** An int grid (rows of ints) from a canon array; missing/invalid -> empty, bad entries -> 0. */
        fun intGrid(element: Any?): List<List<Int>> = (element as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()

        /** A [width] x [height] draft with walls wherever [h] / [v] hold 1 (missing entries: no wall). */
        fun wallDraft(width: Int, height: Int, h: List<List<Int>>, v: List<List<Int>>): RippleEffectDraft =
            if (width <= 0 || height <= 0) RippleEffectDraft() else RippleEffectDraft(
                width = width,
                height = height,
                hWalls = List(height - 1) { r -> List(width) { c -> h.getOrNull(r)?.getOrNull(c) == 1 } },
                vWalls = List(height) { r -> List(width - 1) { c -> v.getOrNull(r)?.getOrNull(c) == 1 } },
            )

        /**
         * A draft from a `{ cells, grids: { h, v } }` canon (nurimaze, nuritwin): the cells
         * fix the size, and each cell value [keep] accepts becomes a clue on it.
         */
        fun cellsAndWallsDraft(canon: JsonObject, keep: (Int) -> Boolean): RippleEffectDraft {
            val cells = intGrid(canon["cells"])
            val grids = canon["grids"] as? JsonObject
            val draft = wallDraft(
                cells.maxOfOrNull { it.size } ?: 0,
                cells.size,
                intGrid(grids?.get("h")),
                intGrid(grids?.get("v")),
            )
            val clues = mutableMapOf<Pair<Int, Int>, Int>()
            for (r in 0 until draft.height) for (c in 0 until draft.width) {
                val v = cells[r].getOrNull(c) ?: 0
                if (keep(v)) clues[r to c] = v
            }
            return draft.copy(clues = clues)
        }

        /** The `{ cells, grids: { h, v } }` canon of a draft: each cell holds its clue, or 0. */
        fun cellsAndWallsCanon(draft: RippleEffectDraft): JsonObject = JsonObject(
            mapOf(
                "cells" to JsonArray(List(draft.height) { r ->
                    JsonArray(List(draft.width) { c -> JsonPrimitive(draft.clues[r to c] ?: 0) })
                }),
                "grids" to wallGrids(draft),
            )
        )

        /** The draft's walls as the canon's `{ h, v }` (1 = wall). */
        fun wallGrids(draft: RippleEffectDraft): JsonObject {
            fun grid(lines: List<List<Boolean>>) =
                JsonArray(lines.map { line -> JsonArray(line.map { JsonPrimitive(if (it) 1 else 0) }) })
            return JsonObject(mapOf("h" to grid(draft.hWalls), "v" to grid(draft.vWalls)))
        }
    }
}

/** Authoring for norinori (type 23): two shaded cells per room. */
object NorinoriAuthoring : WallRoomsAuthoring(2, "two shaded cells") {
    const val PUZZLE_TYPE = 23
}

/** Authoring for LITS (type 15): one shaded tetromino per room. */
object LitsAuthoring : WallRoomsAuthoring(4, "four cells for its tetromino") {
    const val PUZZLE_TYPE = 15
}
