package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Authoring for Hell Golf (type 19), the analog of frontend/src/components/HellGolfEditor.tsx.
 * The canon is `{ lakes, balls, goals }`; the draft folds it into one [ClueGridDraft], as the
 * web editor's grid does: 0 an empty cell, [LAKE] a lake, [GOAL] a goal (H), and n > 0 a ball
 * numbered n. A cell holds one thing, so a ball or goal read onto a lake replaces the lake.
 *
 * Every draft is representable as the canon, so there are no format problems. A ball count
 * that differs from the goal count, or a ball whose number is too long for any line of the
 * board, is a misread warning and stays overridable.
 */
object HellGolfAuthoring : ClueGridAuthoring(19, "hell-golf", "ヘルゴルフ") {
    const val PUZZLE_TYPE = 19
    const val LAKE = -1
    const val GOAL = -2

    override fun keeps(value: Int): Boolean = value > 0 || value == LAKE || value == GOAL

    override fun draftFromCanon(canon: JsonObject): ClueGridDraft {
        val lakes = (canon["lakes"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()
        val rows = lakes.size
        val cols = lakes.maxOfOrNull { it.size } ?: 0
        val cells = List(rows) { r -> MutableList(cols) { c -> if (lakes[r].getOrNull(c) == 1) LAKE else 0 } }
        for (g in (canon["goals"] as? JsonArray).orEmpty()) {
            val a = g as? JsonArray ?: continue
            val r = (a.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: continue
            val c = (a.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: continue
            if (r in 0 until rows && c in 0 until cols) cells[r][c] = GOAL
        }
        for (b in (canon["balls"] as? JsonArray).orEmpty()) {
            val o = b as? JsonObject ?: continue
            val r = (o["r"] as? JsonPrimitive)?.intOrNull ?: continue
            val c = (o["c"] as? JsonPrimitive)?.intOrNull ?: continue
            val n = (o["n"] as? JsonPrimitive)?.intOrNull ?: continue
            if (r in 0 until rows && c in 0 until cols && n > 0) cells[r][c] = n
        }
        return ClueGridDraft(cells)
    }

    override fun canonFromDraft(draft: ClueGridDraft): JsonObject {
        val balls = mutableListOf<JsonObject>()
        val goals = mutableListOf<JsonArray>()
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val v = draft.cells[r][c]
            when {
                v == GOAL -> goals += JsonArray(listOf(JsonPrimitive(r), JsonPrimitive(c)))
                v > 0 -> balls += JsonObject(mapOf("r" to JsonPrimitive(r), "c" to JsonPrimitive(c), "n" to JsonPrimitive(v)))
            }
        }
        return JsonObject(
            mapOf(
                "lakes" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(if (it == LAKE) 1 else 0) }) }),
                "balls" to JsonArray(balls),
                "goals" to JsonArray(goals),
            ),
        )
    }

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        val values = draft.cells.flatten()
        val balls = values.count { it > 0 }
        val goals = values.count { it == GOAL }
        if (balls == 0) add("No balls")
        else if (balls != goals) add("$balls balls but $goals goals: each ball needs its own goal")
        // A ball slides exactly n cells on its first move, so n must fit in its row or column.
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val n = draft.cells[r][c]
            if (n > 0 && c + n >= draft.cols && c - n < 0 && r + n >= draft.rows && r - n < 0) {
                add("${at(r, c)}: ball $n can't move $n cells in any direction")
            }
        }
    }
}
