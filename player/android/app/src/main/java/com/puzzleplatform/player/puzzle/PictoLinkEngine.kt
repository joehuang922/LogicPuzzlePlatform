package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Picto Link (puzzle type 27), black-and-white Link-a-Pix. Ports:
 *  - answer extraction from frontend/src/extractors/pictoLink.ts
 *  - progress from frontend/src/progress/pictoLink.ts
 *  - completion/path validation from frontend/src/components/PictoLinkBoard.tsx
 *    (validateSolution).
 *
 * Each pair of equal clues n >= 2 is joined by a path of exactly n cells (both endpoints
 * included); a 1 is a standalone single cell the player fills by tapping. Paths may not
 * cross, branch, or pass through another clue. Unlike Number Link, a value appears in many
 * pairs and the grid need not be fully filled — the filled cells form a picture.
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = empty, n > 0 = clue (path length).
 *
 * answer: { edges: { h: number[][], v: number[][] }, singles: [row, col][] }
 *   - h: rows x (cols-1); h[r][c] = 1 is a segment between cell (r,c) and (r,c+1).
 *   - v: (rows-1) x cols; v[r][c] = 1 is a segment between cell (r,c) and (r+1,c).
 *   - singles: the filled 1-clue cells.
 *
 * User input rides in the flat userValues map keyed "h:row,col" / "v:row,col" / "s:row,col"
 * -> 1, the web board's transport, so extracted answers match and saves sync both ways.
 */
object PictoLinkEngine : PuzzleEngine {
    override val puzzleType: Int = 27

    const val EMPTY = 0
    const val SEGMENT = 1
    const val FILLED = 1

    fun hKey(row: Int, col: Int): String = "h:$row,$col"
    fun vKey(row: Int, col: Int): String = "v:$row,$col"

    /** Key for a filled single (1-clue) cell. */
    fun sKey(row: Int, col: Int): String = "s:$row,$col"

    /** Parse the rows x cols clue grid from a puzzle's canonRepr; missing/invalid -> 0. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> {
        val outer = puzzle.canonRepr["cells"] as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }
        }
    }

    private fun dims(cells: List<List<Int>>): Pair<Int, Int> =
        cells.size to (cells.maxOfOrNull { it.size } ?: 0)

    private fun clueAt(cells: List<List<Int>>, r: Int, c: Int): Int = cells.getOrNull(r)?.getOrNull(c) ?: 0

    /**
     * Most segments a cell may carry: an empty cell passes through (2), a clue endpoint
     * (n >= 2) touches its one path (1), and a 1-clue is a single with none (0).
     */
    fun maxDegree(clue: Int): Int = when {
        clue == 0 -> 2
        clue == 1 -> 0
        else -> 1
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
                    if (r in 0 until rows && c in 0 until cols - 1) h[r][c] = SEGMENT
                }
                key.startsWith("v:") -> {
                    val (r, c) = parseRC(key.removePrefix("v:")) ?: continue
                    if (r in 0 until rows - 1 && c in 0 until cols) v[r][c] = SEGMENT
                }
            }
        }
        return Edges(h, v)
    }

    /** The filled single cells as (row, col), in-bounds only. */
    fun singles(cells: List<List<Int>>, userValues: Map<String, Int>): Set<Pair<Int, Int>> {
        val (rows, cols) = dims(cells)
        val result = linkedSetOf<Pair<Int, Int>>()
        for ((key, value) in userValues) {
            if (value == EMPTY || !key.startsWith("s:")) continue
            val (r, c) = parseRC(key.removePrefix("s:")) ?: continue
            if (r in 0 until rows && c in 0 until cols) result.add(r to c)
        }
        return result
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
        val singles = singles(cells, userValues).sortedWith(compareBy({ it.first }, { it.second }))
        return JsonObject(
            mapOf(
                "edges" to JsonObject(mapOf("h" to grid(e.h), "v" to grid(e.v))),
                "singles" to JsonArray(singles.map { (r, c) -> JsonArray(listOf(JsonPrimitive(r), JsonPrimitive(c))) }),
            ),
        )
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val result = mutableMapOf<String, Int>()
        (answer["edges"] as? JsonObject)?.let { edgesObj ->
            (edgesObj["h"] as? JsonArray)?.let { h ->
                for (r in 0 until rows) {
                    val rowArr = h.getOrNull(r) as? JsonArray ?: continue
                    for (c in 0 until cols - 1) {
                        val st = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                        if (st != EMPTY) result[hKey(r, c)] = SEGMENT
                    }
                }
            }
            (edgesObj["v"] as? JsonArray)?.let { v ->
                for (r in 0 until rows - 1) {
                    val rowArr = v.getOrNull(r) as? JsonArray ?: continue
                    for (c in 0 until cols) {
                        val st = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                        if (st != EMPTY) result[vKey(r, c)] = SEGMENT
                    }
                }
            }
        }
        (answer["singles"] as? JsonArray)?.forEach { el ->
            val pair = el as? JsonArray ?: return@forEach
            val r = (pair.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: return@forEach
            val c = (pair.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: return@forEach
            if (r in 0 until rows && c in 0 until cols) result[sKey(r, c)] = FILLED
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

    /** The userValues keys of every drawn segment touching cell (r,c). */
    fun segmentKeysAt(e: Edges, r: Int, c: Int, rows: Int, cols: Int): List<String> = buildList {
        if (c > 0 && e.h[r][c - 1] == SEGMENT) add(hKey(r, c - 1))
        if (c < cols - 1 && e.h[r][c] == SEGMENT) add(hKey(r, c))
        if (r > 0 && e.v[r - 1][c] == SEGMENT) add(vKey(r - 1, c))
        if (r < rows - 1 && e.v[r][c] == SEGMENT) add(vKey(r, c))
    }

    /**
     * What a tap at (row, col) changes, or null when it does nothing: a 1-clue toggles its
     * single; a non-clue cell on a path loses every segment touching it.
     */
    fun tapChanges(cells: List<List<Int>>, values: Map<String, Int>, row: Int, col: Int): Map<String, Int>? {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        val clue = cells.getOrNull(row)?.getOrNull(col) ?: return null
        if (clue == 1) {
            val key = sKey(row, col)
            val filled = (values[key] ?: EMPTY) != EMPTY
            return mapOf(key to if (filled) EMPTY else FILLED)
        }
        if (clue != 0) return null
        val keys = segmentKeysAt(edges(cells, values), row, col, rows, cols)
        return keys.takeIf { it.isNotEmpty() }?.associateWith { EMPTY }
    }

    /** True when cell (r,c) is part of the picture: on a drawn path, or a filled single. */
    fun isFilled(e: Edges, singles: Set<Pair<Int, Int>>, r: Int, c: Int, rows: Int, cols: Int): Boolean =
        degreeOf(e, r, c, rows, cols) > 0 || (r to c) in singles

    /**
     * "Clues correctly linked": the share of clue cells on a complete, correct path. A
     * 1-clue counts once filled as a single; a value-n endpoint counts once joined to a
     * matching partner by a non-branching path of exactly n cells. Mirrors
     * frontend/src/progress/pictoLink.ts exactly.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return 0.0
        val e = edges(cells, userValues)
        val singles = singles(cells, userValues)

        var totalClues = 0
        var linkedClues = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val value = clueAt(cells, r, c)
                if (value == 0) continue
                totalClues++
                if (value == 1) {
                    if ((r to c) in singles && degreeOf(e, r, c, rows, cols) == 0) linkedClues++
                    continue
                }
                if (degreeOf(e, r, c, rows, cols) != 1) continue
                // Trace the path; interior cells must pass straight through (one onward step).
                var prev: Pair<Int, Int>? = null
                var cur = r to c
                var count = 0
                var ok = true
                while (true) {
                    count++
                    if (count > value) { ok = false; break } // overshot the required length
                    if (clueAt(cells, cur.first, cur.second) >= 2 && cur != (r to c)) break // reached a clue
                    val ns = neighbors(e, cur.first, cur.second, rows, cols).filter { it != prev }
                    if (ns.size != 1) { ok = false; break }
                    prev = cur
                    cur = ns[0]
                }
                if (ok && count == value && clueAt(cells, cur.first, cur.second) == value && cur != (r to c)) {
                    linkedClues++
                }
            }
        }
        if (totalClues == 0) return 0.0
        return linkedClues.toDouble() / totalClues * 100.0
    }

    /**
     * True when the input is a complete, valid solution (port of PictoLinkBoard.tsx
     * validateSolution):
     *  1. degrees: clue endpoints exactly 1, 1-clues 0 and filled, empty cells 0 or 2,
     *  2. every single is a real 1-clue,
     *  3. each path traced from an endpoint ends at a matching clue after exactly n cells,
     *  4. no segment lies on a stray loop of empty cells (never reached by step 3).
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val e = edges(cells, userValues)
        val singles = singles(cells, userValues)
        if (e.h.all { row -> row.all { it == EMPTY } } && e.v.all { row -> row.all { it == EMPTY } } && singles.isEmpty()) {
            return false
        }

        // 1. Degree constraints.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val value = clueAt(cells, r, c)
                val deg = degreeOf(e, r, c, rows, cols)
                when {
                    value >= 2 -> if (deg != 1) return false
                    value == 1 -> if (deg != 0 || (r to c) !in singles) return false
                    else -> if (deg != 0 && deg != 2) return false
                }
            }
        }

        // 2. No stray fills.
        if (singles.any { (r, c) -> clueAt(cells, r, c) != 1 }) return false

        // 3. Trace each path from a clue endpoint.
        val visited = Array(rows) { BooleanArray(cols) }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (clueAt(cells, r, c) < 2 || visited[r][c]) continue
                val startVal = clueAt(cells, r, c)
                var prev: Pair<Int, Int>? = null
                var cur = r to c
                var count = 0
                while (true) {
                    visited[cur.first][cur.second] = true
                    count++
                    if (count > rows * cols) return false // runaway guard
                    if (clueAt(cells, cur.first, cur.second) >= 2 && cur != (r to c)) break
                    val ns = neighbors(e, cur.first, cur.second, rows, cols).filter { it != prev }
                    if (ns.isEmpty()) break
                    prev = cur
                    cur = ns[0]
                }
                if (clueAt(cells, cur.first, cur.second) != startVal) return false // mismatched partner
                if (cur == (r to c)) return false // never left the start
                if (count != startVal) return false // wrong path length
            }
        }

        // 4. No segment on an untraced (stray) loop.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (degreeOf(e, r, c, rows, cols) > 0 && !visited[r][c]) return false
            }
        }
        return true
    }

    /** The solved picture: filled cells black on a light ground. */
    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return null
        val values = restoreUserValues(puzzle, answer)
        val e = edges(cells, values)
        val singles = singles(cells, values)
        val pixels = IntArray(rows * cols) { i ->
            if (isFilled(e, singles, i / cols, i % cols, rows, cols)) THUMB_FILL_ARGB else THUMB_GROUND_ARGB
        }
        return PuzzleThumbnail(width = cols, height = rows, cells = pixels)
    }
}

/** Opaque black for a filled cell of the picture. */
private const val THUMB_FILL_ARGB = 0xFF000000.toInt()

/** Light-grey ground for cells off every path, matching the nonogram thumbnail. */
private const val THUMB_GROUND_ARGB = 0xFFD9D9D9.toInt()
