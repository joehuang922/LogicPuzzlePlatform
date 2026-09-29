package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Masyu (puzzle type 7). Ports:
 *  - answer extraction from frontend/src/extractors/masyu.ts
 *  - live-validation analysis from frontend/src/liveValidators/masyu.ts (analyzeMasyu)
 *  - completion logic from frontend/src/components/MasyuBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = empty, 1 = white circle,
 *   2 = black circle. The player draws a single closed loop through cell centers.
 *
 * answer: { edges: { h: number[][], v: number[][] } }
 *   - h: rows x (cols-1); h[r][c] = 1 means a segment between (r,c) and (r,c+1)
 *   - v: (rows-1) x cols; v[r][c] = 1 means a segment between (r,c) and (r+1,c)
 *
 * Unlike the digit puzzles, input is drag-to-draw rather than tap-to-enter; but it
 * still rides in the flat userValues map keyed "h:r,c" / "v:r,c" -> 1, matching the
 * web client's transport exactly so extracted answers are identical. There is no
 * "col,row" digit entry and no pencil-mark notes.
 */
object MasyuEngine : PuzzleEngine {
    override val puzzleType: Int = 7

    const val EMPTY = 0
    const val WHITE = 1 // hollow circle: pass straight through, turn in >=1 neighbor
    const val BLACK = 2 // filled circle: turn here, go straight in both neighbors

    enum class Direction { UP, DOWN, LEFT, RIGHT }

    /** Build the flat userValues key for a horizontal segment left-anchored at (r,c). */
    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    /** Build the flat userValues key for a vertical segment top-anchored at (r,c). */
    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    /** Parse the rows x cols cell grid from a puzzle's canonRepr; missing/invalid -> empty. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> = parseCells(puzzle.canonRepr["cells"])

    private fun parseCells(element: Any?): List<List<Int>> {
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

    /**
     * Materialize the h/v edge grids from the flat userValues map, matching the
     * web extractor (a segment is present only when its key maps to 1).
     */
    fun edges(cells: List<List<Int>>, userValues: Map<String, Int>): Edges {
        val (rows, cols) = dims(cells)
        val h = Array(rows) { IntArray(if (cols > 0) cols - 1 else 0) }
        val v = Array(if (rows > 0) rows - 1 else 0) { IntArray(cols) }
        for ((key, value) in userValues) {
            if (value != 1) continue
            when {
                key.startsWith("h:") -> {
                    val (r, c) = parseRC(key.removePrefix("h:")) ?: continue
                    if (r in 0 until rows && c in 0 until cols - 1) h[r][c] = 1
                }
                key.startsWith("v:") -> {
                    val (r, c) = parseRC(key.removePrefix("v:")) ?: continue
                    if (r in 0 until rows - 1 && c in 0 until cols) v[r][c] = 1
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

    /** h: rows x (cols-1), v: (rows-1) x cols — 1 = a drawn segment. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>)

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
     * Progress = (circles whose constraint is fully satisfied / total circles) * 100.
     * "Satisfied" uses the same per-circle predicate as completion ([circleSatisfied]),
     * so a solved board reads exactly 100% and a board with no circles reads 0.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return 0.0
        val e = edges(cells, userValues)

        var total = 0
        var satisfied = 0
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val kind = cells[r][c]
                if (kind == EMPTY) continue
                total++
                if (circleSatisfied(r, c, kind, e, rows, cols)) satisfied++
            }
        }
        if (total == 0) return 0.0
        return satisfied.toDouble() / total * 100.0
    }

    /**
     * True when the circle at (r,c) has its Masyu constraint fully satisfied by the
     * segments drawn so far — the same rule applied per-circle at completion:
     *  - exactly two connected segments, and
     *  - WHITE: passes straight through with a turn in ≥1 along-line neighbor;
     *  - BLACK: turns here, with both outgoing segments continuing straight ≥1 cell.
     */
    fun circleSatisfied(r: Int, c: Int, kind: Int, e: Edges, rows: Int, cols: Int): Boolean {
        val dirs = connections(r, c, e, rows, cols)
        if (dirs.size != 2) return false
        return when (kind) {
            WHITE -> {
                if (!isStraight(dirs)) return false
                if (dirs.contains(Direction.LEFT) && dirs.contains(Direction.RIGHT)) {
                    isTurn(connections(r, c - 1, e, rows, cols)) || isTurn(connections(r, c + 1, e, rows, cols))
                } else {
                    isTurn(connections(r - 1, c, e, rows, cols)) || isTurn(connections(r + 1, c, e, rows, cols))
                }
            }
            BLACK -> {
                if (!isTurn(dirs)) return false
                dirs.all { d ->
                    val (nr, nc) = step(r, c, d)
                    isStraight(connections(nr, nc, e, rows, cols))
                }
            }
            else -> false
        }
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
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[hKey(r, c)] = 1
                }
            }
        }
        (edgesObj["v"] as? JsonArray)?.let { v ->
            for (r in 0 until rows - 1) {
                val rowArr = v.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[vKey(r, c)] = 1
                }
            }
        }
        return result
    }

    // -- graph helpers (ports of liveValidators/masyu.ts) ---------------------

    /** Directions in which cell (r,c) currently has a drawn segment. */
    fun connections(r: Int, c: Int, e: Edges, rows: Int, cols: Int): List<Direction> {
        val dirs = mutableListOf<Direction>()
        if (c > 0 && e.h[r][c - 1] == 1) dirs.add(Direction.LEFT)
        if (c < cols - 1 && e.h[r][c] == 1) dirs.add(Direction.RIGHT)
        if (r > 0 && e.v[r - 1][c] == 1) dirs.add(Direction.UP)
        if (r < rows - 1 && e.v[r][c] == 1) dirs.add(Direction.DOWN)
        return dirs
    }

    fun isStraight(dirs: List<Direction>): Boolean {
        if (dirs.size != 2) return false
        return (dirs.contains(Direction.LEFT) && dirs.contains(Direction.RIGHT)) ||
            (dirs.contains(Direction.UP) && dirs.contains(Direction.DOWN))
    }

    fun isTurn(dirs: List<Direction>): Boolean = dirs.size == 2 && !isStraight(dirs)

    private fun step(r: Int, c: Int, d: Direction): Pair<Int, Int> = when (d) {
        Direction.UP -> r - 1 to c
        Direction.DOWN -> r + 1 to c
        Direction.LEFT -> r to c - 1
        Direction.RIGHT -> r to c + 1
    }

    /** Live-validation annotations (mirrors analyzeMasyu's return). */
    data class Analysis(
        val circleErrors: Set<String>, // "r,c" of a circle whose rule is already broken
        val loopSegments: Set<String>, // "h:r,c" / "v:r,c" of a premature closed loop
    )

    /**
     * Report only *certain* violations, so a work-in-progress is never accused:
     *   - a circle with >2 segments (a branch), or a white/black rule already refuted
     *   - the segments of a closed loop drawn while any circle is still
     *     uncovered/unsatisfied or more than one loop exists (a dead-end).
     */
    fun analyze(puzzle: Puzzle, userValues: Map<String, Int>): Analysis {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return Analysis(emptySet(), emptySet())
        val e = edges(cells, userValues)
        fun conn(r: Int, c: Int) = connections(r, c, e, rows, cols)

        val circleErrors = mutableSetOf<String>()
        for (r in 0 until rows) {
            for (c in 0 until (cells[r].size)) {
                val kind = cells[r][c]
                if (kind == EMPTY) continue
                val dirs = conn(r, c)
                if (dirs.size < 2) continue
                if (dirs.size > 2) { circleErrors.add("$r,$c"); continue }

                if (kind == WHITE) {
                    if (!isStraight(dirs)) { circleErrors.add("$r,$c"); continue }
                    val (a, b) = if (dirs.contains(Direction.LEFT)) {
                        conn(r, c - 1) to conn(r, c + 1)
                    } else {
                        conn(r - 1, c) to conn(r + 1, c)
                    }
                    if (a.size == 2 && b.size == 2 && isStraight(a) && isStraight(b)) {
                        circleErrors.add("$r,$c")
                    }
                } else { // BLACK
                    if (!isTurn(dirs)) { circleErrors.add("$r,$c"); continue }
                    for (d in dirs) {
                        val (nr, nc) = step(r, c, d)
                        val nDirs = conn(nr, nc)
                        if (nDirs.size == 2 && isTurn(nDirs)) { circleErrors.add("$r,$c"); break }
                    }
                }
            }
        }

        // Degree of every cell in the segment graph.
        val degree = Array(rows) { r -> IntArray(cols) { c -> conn(r, c).size } }
        val visited = Array(rows) { BooleanArray(cols) }
        val closedLoopH = mutableListOf<String>()
        val closedLoopV = mutableListOf<String>()
        val coveredByLoop = mutableSetOf<String>()
        var closedLoopCount = 0

        for (sr in 0 until rows) {
            for (sc in 0 until cols) {
                if (degree[sr][sc] == 0 || visited[sr][sc]) continue
                val compCells = mutableListOf<Pair<Int, Int>>()
                val compH = mutableListOf<String>()
                val compV = mutableListOf<String>()
                var allDegree2 = true
                val stack = ArrayDeque<Pair<Int, Int>>()
                stack.addLast(sr to sc)
                visited[sr][sc] = true
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    compCells.add(cr to cc)
                    if (degree[cr][cc] != 2) allDegree2 = false
                    for (d in conn(cr, cc)) {
                        val (nr, nc) = step(cr, cc, d)
                        if (d == Direction.RIGHT) compH.add("$cr,$cc")
                        else if (d == Direction.DOWN) compV.add("$cr,$cc")
                        if (!visited[nr][nc]) { visited[nr][nc] = true; stack.addLast(nr to nc) }
                    }
                }
                if (allDegree2) {
                    closedLoopCount++
                    compCells.forEach { coveredByLoop.add("${it.first},${it.second}") }
                    closedLoopH.addAll(compH)
                    closedLoopV.addAll(compV)
                }
            }
        }

        val loopSegments = mutableSetOf<String>()
        if (closedLoopCount > 0) {
            var circleUncovered = false
            loop@ for (r in 0 until rows) {
                for (c in 0 until cells[r].size) {
                    if (cells[r][c] != EMPTY && !coveredByLoop.contains("$r,$c")) {
                        circleUncovered = true; break@loop
                    }
                }
            }
            if (circleUncovered || circleErrors.isNotEmpty() || closedLoopCount > 1) {
                closedLoopH.forEach { loopSegments.add("h:$it") }
                closedLoopV.forEach { loopSegments.add("v:$it") }
            }
        }

        return Analysis(circleErrors, loopSegments)
    }

    /**
     * True when the drawn segments form exactly one closed loop that satisfies every
     * circle (port of MasyuBoard.tsx validateSolution). Empty board -> not complete.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val e = edges(cells, userValues)

        val degree = Array(rows) { IntArray(cols) }
        for (r in 0 until rows) for (c in 0 until cols - 1) if (e.h[r][c] == 1) { degree[r][c]++; degree[r][c + 1]++ }
        for (r in 0 until rows - 1) for (c in 0 until cols) if (e.v[r][c] == 1) { degree[r][c]++; degree[r + 1][c]++ }

        var loopCellCount = 0
        var startR = -1
        var startC = -1
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (degree[r][c] != 0 && degree[r][c] != 2) return false
                if (degree[r][c] == 2) {
                    loopCellCount++
                    if (startR < 0) { startR = r; startC = c }
                }
            }
        }
        if (loopCellCount == 0) return false

        // Every circle must be part of the loop.
        for (r in 0 until rows) for (c in 0 until cells[r].size) {
            if (cells[r][c] != EMPTY && degree[r][c] != 2) return false
        }

        // Single connected component (BFS from a degree-2 cell reaches every loop cell).
        val visited = Array(rows) { BooleanArray(cols) }
        val queue = ArrayDeque<Pair<Int, Int>>()
        queue.addLast(startR to startC)
        visited[startR][startC] = true
        var visitedCount = 1
        while (queue.isNotEmpty()) {
            val (cr, cc) = queue.removeLast()
            if (cc < cols - 1 && e.h[cr][cc] == 1 && !visited[cr][cc + 1]) { visited[cr][cc + 1] = true; visitedCount++; queue.addLast(cr to cc + 1) }
            if (cc > 0 && e.h[cr][cc - 1] == 1 && !visited[cr][cc - 1]) { visited[cr][cc - 1] = true; visitedCount++; queue.addLast(cr to cc - 1) }
            if (cr < rows - 1 && e.v[cr][cc] == 1 && !visited[cr + 1][cc]) { visited[cr + 1][cc] = true; visitedCount++; queue.addLast(cr + 1 to cc) }
            if (cr > 0 && e.v[cr - 1][cc] == 1 && !visited[cr - 1][cc]) { visited[cr - 1][cc] = true; visitedCount++; queue.addLast(cr - 1 to cc) }
        }
        if (visitedCount != loopCellCount) return false

        // Circle rules (same per-circle predicate as computeProgress).
        for (r in 0 until rows) {
            for (c in 0 until cells[r].size) {
                val kind = cells[r][c]
                if (kind == EMPTY) continue
                if (!circleSatisfied(r, c, kind, e, rows, cols)) return false
            }
        }
        return true
    }
}
