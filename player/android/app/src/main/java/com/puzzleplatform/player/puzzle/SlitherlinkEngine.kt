package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Slitherlink (puzzle type 5). Ports:
 *  - answer extraction from frontend/src/extractors/slitherlink.ts
 *  - progress from frontend/src/progress/slitherlink.ts
 *  - completion/loop validation from frontend/src/components/SlitherlinkBoard.tsx
 *    (validateSolution).
 *
 * The player draws a single closed loop along the grid lines between dots. Each numbered
 * cell (0-3) states how many of its 4 surrounding edges are part of the loop.
 *
 * canonRepr: { cells: number[][] } — rows x cols; -1 = empty (no clue), 0-3 = clue.
 *
 * answer: { edges: { h: number[][], v: number[][] } }
 *   - h: (rows+1) x cols; h[r][c] is the horizontal segment on grid-line row r, spanning
 *     col c..c+1. Edges sit *between dots*, so h includes the top/bottom borders.
 *   - v: rows x (cols+1); v[r][c] is the vertical segment on grid-line col c, spanning
 *     row r..r+1 — includes the left/right borders.
 *   Each value: 0 = empty, 1 = line (loop edge), 2 = cross (player aid: "no edge here").
 *
 * User input rides in the flat userValues map keyed "h:row,col" / "v:row,col" -> state,
 * matching the web board's transport exactly so extracted answers are byte-identical and
 * snapshots sync cross-platform. Unlike the Nonogram/LITS ports, crosses (state 2) need no
 * separate grid: the web extractor already persists them inside edges.h/edges.v, so they
 * round-trip for free.
 */
object SlitherlinkEngine : PuzzleEngine {
    override val puzzleType: Int = 5

    const val EMPTY = 0
    const val LINE = 1
    const val CROSS = 2

    /** Build the flat userValues key for a horizontal segment on grid-line (row, col). */
    fun hKey(row: Int, col: Int): String = "h:$row,$col"

    /** Build the flat userValues key for a vertical segment on grid-line (row, col). */
    fun vKey(row: Int, col: Int): String = "v:$row,$col"

    /** Parse the rows x cols clue grid from a puzzle's canonRepr; missing/invalid -> -1. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> = parseGrid(puzzle.canonRepr["cells"])

    private fun parseGrid(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: -1 }
        }
    }

    private fun dims(cells: List<List<Int>>): Pair<Int, Int> {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        return rows to cols
    }

    /** h: (rows+1) x cols, v: rows x (cols+1) — 0 empty, 1 line, 2 cross. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>)

    /**
     * Materialize the h/v edge grids from the flat userValues map, matching the web
     * extractor (every non-empty state is written through, so crosses persist too).
     */
    fun edges(cells: List<List<Int>>, userValues: Map<String, Int>): Edges {
        val (rows, cols) = dims(cells)
        val h = Array(rows + 1) { IntArray(cols) }
        val v = Array(rows) { IntArray(cols + 1) }
        for ((key, value) in userValues) {
            if (value == EMPTY) continue
            when {
                key.startsWith("h:") -> {
                    val (r, c) = parseRC(key.removePrefix("h:")) ?: continue
                    if (r in 0..rows && c in 0 until cols) h[r][c] = value
                }
                key.startsWith("v:") -> {
                    val (r, c) = parseRC(key.removePrefix("v:")) ?: continue
                    if (r in 0 until rows && c in 0..cols) v[r][c] = value
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
     * Progress = (cells with at least one non-empty surrounding edge / total cells) * 100.
     * Mirrors frontend/src/progress/slitherlink.ts exactly: a line OR a cross on any of a
     * cell's 4 edges counts that cell as having progress.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val total = rows * cols
        if (total == 0) return 0.0
        val e = edges(cells, userValues)

        var withEdge = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val any = e.h[r][c] != EMPTY || e.h[r + 1][c] != EMPTY ||
                    e.v[r][c] != EMPTY || e.v[r][c + 1] != EMPTY
                if (any) withEdge++
            }
        }
        return withEdge.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val edgesObj = answer["edges"] as? JsonObject ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        (edgesObj["h"] as? JsonArray)?.let { h ->
            for (r in 0..rows) {
                val rowArr = h.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    val st = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (st != EMPTY) result[hKey(r, c)] = st
                }
            }
        }
        (edgesObj["v"] as? JsonArray)?.let { v ->
            for (r in 0 until rows) {
                val rowArr = v.getOrNull(r) as? JsonArray ?: continue
                for (c in 0..cols) {
                    val st = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (st != EMPTY) result[vKey(r, c)] = st
                }
            }
        }
        return result
    }

    /**
     * True when the drawn lines form a single closed loop satisfying every clue (port of
     * SlitherlinkBoard.tsx validateSolution). Only lines (state 1) count toward the loop;
     * crosses (state 2) are a player aid and are ignored here. Empty board -> not complete.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val e = edges(cells, userValues)

        // 1. Clue counts: each numbered cell has exactly that many loop edges around it.
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val clue = cells[r][c]
                if (clue < 0) continue
                var count = 0
                if (e.h[r][c] == LINE) count++       // top
                if (e.h[r + 1][c] == LINE) count++   // bottom
                if (e.v[r][c] == LINE) count++       // left
                if (e.v[r][c + 1] == LINE) count++   // right
                if (count != clue) return false
            }
        }

        // 2. Degree of every dot (intersection) must be 0 or 2 — a loop, no branches.
        val degree = Array(rows + 1) { IntArray(cols + 1) }
        for (r in 0..rows) for (c in 0 until cols) if (e.h[r][c] == LINE) { degree[r][c]++; degree[r][c + 1]++ }
        for (r in 0 until rows) for (c in 0..cols) if (e.v[r][c] == LINE) { degree[r][c]++; degree[r + 1][c]++ }

        var loopDotCount = 0
        var startR = -1
        var startC = -1
        for (r in 0..rows) {
            for (c in 0..cols) {
                if (degree[r][c] != 0 && degree[r][c] != 2) return false
                if (degree[r][c] == 2) {
                    loopDotCount++
                    if (startR < 0) { startR = r; startC = c }
                }
            }
        }
        if (loopDotCount == 0) return false

        // 3. Single connected loop: BFS over line edges from a degree-2 dot reaches all of them.
        val visited = Array(rows + 1) { BooleanArray(cols + 1) }
        val queue = ArrayDeque<Pair<Int, Int>>()
        queue.addLast(startR to startC)
        visited[startR][startC] = true
        var visitedCount = 1
        while (queue.isNotEmpty()) {
            val (cr, cc) = queue.removeLast()
            // right: h[cr][cc] connects dot (cr,cc)-(cr,cc+1)
            if (cc < cols && e.h[cr][cc] == LINE && !visited[cr][cc + 1]) { visited[cr][cc + 1] = true; visitedCount++; queue.addLast(cr to cc + 1) }
            // left: h[cr][cc-1]
            if (cc > 0 && e.h[cr][cc - 1] == LINE && !visited[cr][cc - 1]) { visited[cr][cc - 1] = true; visitedCount++; queue.addLast(cr to cc - 1) }
            // down: v[cr][cc] connects dot (cr,cc)-(cr+1,cc)
            if (cr < rows && e.v[cr][cc] == LINE && !visited[cr + 1][cc]) { visited[cr + 1][cc] = true; visitedCount++; queue.addLast(cr + 1 to cc) }
            // up: v[cr-1][cc]
            if (cr > 0 && e.v[cr - 1][cc] == LINE && !visited[cr - 1][cc]) { visited[cr - 1][cc] = true; visitedCount++; queue.addLast(cr - 1 to cc) }
        }
        return visitedCount == loopDotCount
    }
}
