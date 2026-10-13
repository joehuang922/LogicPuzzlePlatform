package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Shikaku (puzzle type 22). Ports:
 *  - answer extraction from frontend/src/extractors/shikaku.ts
 *  - progress from frontend/src/progress/shikaku.ts
 *  - completion/tiling validation from frontend/src/components/ShikakuBoard.tsx
 *    (validateSolution).
 *
 * The player divides the whole grid into rectangles, each covering exactly one clue whose
 * value equals the rectangle's area; every cell belongs to exactly one rectangle.
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = empty cell, a positive integer is an
 *   area clue.
 *
 * answer: { rects: [{ r, c, w, h }] } — one rectangle per clue, top-left (r,c) with width w
 *   (columns) and height h (rows).
 *
 * User input rides in the flat userValues map keyed "rect:r,c" -> encodeWH(w,h) = w*1000+h,
 * matching the web board's transport exactly so extracted answers are byte-identical and
 * snapshots sync cross-platform. A rectangle is identified by its top-left cell, so at most
 * one rectangle can be anchored at any (r,c).
 */
object ShikakuEngine : PuzzleEngine {
    override val puzzleType: Int = 22

    /** Encode a rectangle's (w, h) into a single positive user value (web parity). */
    fun encodeWH(w: Int, h: Int): Int = w * 1000 + h

    /** Build the flat userValues key for a rectangle anchored at top-left (row, col). */
    fun rectKey(r: Int, c: Int): String = "rect:$r,$c"

    /** A placed rectangle: top-left (r,c), width w (cols), height h (rows). */
    data class Rect(val r: Int, val c: Int, val w: Int, val h: Int)

    /** Parse the rows x cols clue grid from a puzzle's canonRepr; missing/invalid -> 0. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> {
        val outer = puzzle.canonRepr["cells"] as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }
        }
    }

    private fun dims(cells: List<List<Int>>): Pair<Int, Int> {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        return rows to cols
    }

    /**
     * Materialize the in-bounds rectangles from the flat userValues map (web extractor
     * parity). A key/value is dropped unless it decodes to a rectangle that fits the grid.
     */
    fun rects(cells: List<List<Int>>, userValues: Map<String, Int>): List<Rect> {
        val (rows, cols) = dims(cells)
        val out = ArrayList<Rect>()
        for ((key, value) in userValues) {
            if (!key.startsWith("rect:")) continue
            val (r, c) = parseRC(key.removePrefix("rect:")) ?: continue
            val w = value / 1000
            val h = value % 1000
            if (w >= 1 && h >= 1 && r >= 0 && c >= 0 && r + h <= rows && c + w <= cols) {
                out.add(Rect(r, c, w, h))
            }
        }
        return out
    }

    private fun parseRC(s: String): Pair<Int, Int>? {
        val parts = s.split(",")
        if (parts.size != 2) return null
        val r = parts[0].toIntOrNull() ?: return null
        val c = parts[1].toIntOrNull() ?: return null
        return r to c
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val arr = JsonArray(
            rects(cells, userValues).map { rect ->
                JsonObject(
                    mapOf(
                        "r" to JsonPrimitive(rect.r),
                        "c" to JsonPrimitive(rect.c),
                        "w" to JsonPrimitive(rect.w),
                        "h" to JsonPrimitive(rect.h),
                    ),
                )
            },
        )
        return JsonObject(mapOf("rects" to arr))
    }

    /**
     * Progress = (cells covered by at least one drawn rectangle / total cells) * 100.
     * Mirrors frontend/src/progress/shikaku.ts: overlaps are prevented on input, but a cell
     * covered by multiple stale rects is still counted once.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val total = rows * cols
        if (total == 0) return 0.0

        val covered = Array(rows) { BooleanArray(cols) }
        for (rect in rects(cells, userValues)) {
            for (rr in rect.r until rect.r + rect.h) {
                for (cc in rect.c until rect.c + rect.w) {
                    covered[rr][cc] = true
                }
            }
        }
        var count = 0
        for (r in 0 until rows) for (c in 0 until cols) if (covered[r][c]) count++
        return count.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val arr = answer["rects"] as? JsonArray ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (el in arr) {
            val obj = el as? JsonObject ?: continue
            val r = (obj["r"] as? JsonPrimitive)?.intOrNull ?: continue
            val c = (obj["c"] as? JsonPrimitive)?.intOrNull ?: continue
            val w = (obj["w"] as? JsonPrimitive)?.intOrNull ?: continue
            val h = (obj["h"] as? JsonPrimitive)?.intOrNull ?: continue
            if (w >= 1 && h >= 1 && r >= 0 && c >= 0 && r + h <= rows && c + w <= cols) {
                result[rectKey(r, c)] = encodeWH(w, h)
            }
        }
        return result
    }

    /** How many clue cells fall inside a rectangle, and (if exactly one) that clue's value. */
    private fun clueInfo(rect: Rect, cells: List<List<Int>>): Pair<Int, Int> {
        var count = 0
        var value = 0
        for (r in rect.r until rect.r + rect.h) {
            for (c in rect.c until rect.c + rect.w) {
                val v = cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (v > 0) {
                    count++
                    value = v
                }
            }
        }
        return count to value
    }

    /**
     * True when the drawn rectangles form a valid, complete Shikaku tiling (port of
     * ShikakuBoard.tsx validateSolution):
     *  1. every cell is covered exactly once (clean tiling, no gaps or overlaps),
     *  2. every rectangle contains exactly one clue and its area equals that clue.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val list = rects(cells, userValues)

        // 1. Every cell covered exactly once.
        val cover = Array(rows) { IntArray(cols) }
        for (rect in list) {
            for (r in rect.r until rect.r + rect.h) {
                for (c in rect.c until rect.c + rect.w) {
                    cover[r][c]++
                }
            }
        }
        for (r in 0 until rows) for (c in 0 until cols) if (cover[r][c] != 1) return false

        // 2. Each rectangle holds exactly one clue, matching its area.
        for (rect in list) {
            val (count, value) = clueInfo(rect, cells)
            if (count != 1) return false
            if (rect.w * rect.h != value) return false
        }
        return true
    }
}
