package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Number Link (puzzle type 17). Ports:
 *  - answer extraction from frontend/src/extractors/numberLink.ts
 *  - progress from frontend/src/progress/numberLink.ts
 *  - completion/path validation from frontend/src/components/NumberLinkBoard.tsx
 *    (validateSolution).
 *
 * The player draws continuous paths connecting each pair of matching numbers. Paths run
 * between adjacent cell centers, may not cross/branch, and (Nikoli-strict) every cell must
 * be used by exactly one path.
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = empty, a positive integer is a
 *   numbered endpoint (each distinct value appears in exactly two cells).
 *
 * answer: { edges: { h: number[][], v: number[][] } }
 *   - h: rows x (cols-1); h[r][c] = 1 is a segment between cell (r,c) and (r,c+1).
 *   - v: (rows-1) x cols; v[r][c] = 1 is a segment between cell (r,c) and (r+1,c).
 *   Each value: 0 = no segment, 1 = segment drawn. (Edges connect cell *centers*, unlike
 *   Slitherlink's between-dots edges.)
 *
 * User input rides in the flat userValues map keyed "h:row,col" / "v:row,col" -> 1,
 * matching the web board's transport exactly so extracted answers are byte-identical and
 * snapshots sync cross-platform.
 */
object NumberLinkEngine : PuzzleEngine {
    override val puzzleType: Int = 17

    const val EMPTY = 0
    const val SEGMENT = 1

    /** Build the flat userValues key for a horizontal segment between (row,col)-(row,col+1). */
    fun hKey(row: Int, col: Int): String = "h:$row,$col"

    /** Build the flat userValues key for a vertical segment between (row,col)-(row+1,col). */
    fun vKey(row: Int, col: Int): String = "v:$row,$col"

    /** Parse the rows x cols clue grid from a puzzle's canonRepr; missing/invalid -> 0. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> = parseGrid(puzzle.canonRepr["cells"])

    private fun parseGrid(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray ?: return emptyList()
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

    /** h: rows x (cols-1), v: (rows-1) x cols — 0 none, 1 segment. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>)

    /** Materialize the h/v edge grids from the flat userValues map (web extractor parity). */
    fun edges(cells: List<List<Int>>, userValues: Map<String, Int>): Edges {
        val (rows, cols) = dims(cells)
        val h = Array(rows) { IntArray((cols - 1).coerceAtLeast(0)) }
        val v = Array((rows - 1).coerceAtLeast(0)) { IntArray(cols) }
        for ((key, value) in userValues) {
            if (value == EMPTY) continue
            when {
                key.startsWith("h:") -> {
                    val (r, c) = parseRC(key.removePrefix("h:")) ?: continue
                    if (r in 0 until rows && c in 0 until cols - 1) h[r][c] = value
                }
                key.startsWith("v:") -> {
                    val (r, c) = parseRC(key.removePrefix("v:")) ?: continue
                    if (r in 0 until rows - 1 && c in 0 until cols) v[r][c] = value
                }
            }
        }
        return Edges(h, v)
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
        val e = edges(cells, userValues)
        fun grid(rows: Array<IntArray>) = JsonArray(rows.map { row ->
            JsonArray(row.map { JsonPrimitive(it) })
        })
        return JsonObject(
            mapOf("edges" to JsonObject(mapOf("h" to grid(e.h), "v" to grid(e.v)))),
        )
    }

    /**
     * Progress = (cells touched by at least one drawn segment / total cells) * 100.
     * Mirrors frontend/src/progress/numberLink.ts exactly.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val total = rows * cols
        if (total == 0) return 0.0
        val e = edges(cells, userValues)

        val touched = Array(rows) { BooleanArray(cols) }
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (e.h[r][c] != EMPTY) { touched[r][c] = true; touched[r][c + 1] = true }
            }
        }
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (e.v[r][c] != EMPTY) { touched[r][c] = true; touched[r + 1][c] = true }
            }
        }
        var count = 0
        for (r in 0 until rows) for (c in 0 until cols) if (touched[r][c]) count++
        return count.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val edgesObj = answer["edges"] as? JsonObject ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        (edgesObj["h"] as? JsonArray)?.let { h ->
            for (r in 0 until rows) {
                val rowArr = h.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols - 1) {
                    val st = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (st != EMPTY) result[hKey(r, c)] = st
                }
            }
        }
        (edgesObj["v"] as? JsonArray)?.let { v ->
            for (r in 0 until rows - 1) {
                val rowArr = v.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    val st = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (st != EMPTY) result[vKey(r, c)] = st
                }
            }
        }
        return result
    }

    /** Count of drawn segments touching cell (r,c) — its path degree. */
    fun degreeOf(e: Edges, r: Int, c: Int, rows: Int, cols: Int): Int {
        var d = 0
        if (c > 0 && e.h[r][c - 1] == SEGMENT) d++
        if (c < cols - 1 && e.h[r][c] == SEGMENT) d++
        if (r > 0 && e.v[r - 1][c] == SEGMENT) d++
        if (r < rows - 1 && e.v[r][c] == SEGMENT) d++
        return d
    }

    private fun neighbors(e: Edges, r: Int, c: Int, rows: Int, cols: Int): List<Pair<Int, Int>> {
        val ns = ArrayList<Pair<Int, Int>>(4)
        if (c > 0 && e.h[r][c - 1] == SEGMENT) ns.add(r to c - 1)
        if (c < cols - 1 && e.h[r][c] == SEGMENT) ns.add(r to c + 1)
        if (r > 0 && e.v[r - 1][c] == SEGMENT) ns.add(r - 1 to c)
        if (r < rows - 1 && e.v[r][c] == SEGMENT) ns.add(r + 1 to c)
        return ns
    }

    /**
     * True when the drawn segments form a valid, complete Number Link solution (port of
     * NumberLinkBoard.tsx validateSolution):
     *  1. every endpoint cell has degree 1, every other cell degree 2 (this alone enforces
     *     no-branch, no-cross, and fully-filled),
     *  2. tracing each path from an endpoint ends at a matching-value endpoint,
     *  3. every cell is reached by some traced path (no stray empty-cell loops).
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val e = edges(cells, userValues)

        // 1. Degree constraints.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val expected = if ((cells.getOrNull(r)?.getOrNull(c) ?: 0) > 0) 1 else 2
                if (degreeOf(e, r, c, rows, cols) != expected) return false
            }
        }

        // 2. Trace each path from an endpoint; the far end must match the start's value.
        val visited = Array(rows) { BooleanArray(cols) }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((cells[r][c]) == 0 || visited[r][c]) continue
                val startVal = cells[r][c]
                var prev: Pair<Int, Int>? = null
                var cur = r to c
                while (true) {
                    visited[cur.first][cur.second] = true
                    // Reached a different endpoint — path terminates here.
                    if (cells[cur.first][cur.second] > 0 && !(cur.first == r && cur.second == c)) break
                    val ns = neighbors(e, cur.first, cur.second, rows, cols)
                        .filter { it != prev }
                    if (ns.isEmpty()) break // dead end (shouldn't happen given degrees)
                    prev = cur
                    cur = ns[0]
                }
                if (cells[cur.first][cur.second] != startVal) return false
                if (cur.first == r && cur.second == c) return false // never left the start
            }
        }

        // 3. Every cell must have been traced (no isolated empty-cell loops).
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!visited[r][c]) return false
            }
        }

        return true
    }
}
