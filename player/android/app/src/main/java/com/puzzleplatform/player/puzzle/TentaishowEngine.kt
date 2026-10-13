package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Tentai Show / Spiral Galaxies (puzzle type 20). Ports:
 *  - answer extraction from frontend/src/extractors/tentaishow.ts
 *  - progress from frontend/src/progress/tentaishow.ts
 *  - region flood-fill, dot assignment and completion logic from
 *    frontend/src/components/TentaishowBoard.tsx (computeRegions / assignDotsToRegions /
 *    validateSolution)
 *
 * The player draws walls along cell edges to divide the grid into galaxies: each region
 * holds exactly one dot and is 180°-rotationally symmetric about it.
 *
 * canonRepr: { width, height, dots: [{ dr, dc, color }] } — dots in doubled coordinates,
 *   cell (r,c)'s center is (2r+1, 2c+1); an even coordinate sits on a grid line, so a dot
 *   can be a cell center, an edge midpoint, or a grid corner. color 0 = open, 1 = filled
 *   (cosmetic only).
 *
 * answer: { edges: { h: number[][], v: number[][] } }
 *   - edges.h: (height-1) x width; h[r][c] = 1 is a wall between (r,c) and (r+1,c).
 *   - edges.v: height x (width-1); v[r][c] = 1 is a wall between (r,c) and (r,c+1).
 *
 * Walls ride in the flat userValues map as "h:r,c" -> 1 / "v:r,c" -> 1 (row,col order),
 * matching the web board's transport exactly so extracted answers are byte-identical and
 * snapshots sync cross-platform.
 */
object TentaishowEngine : PuzzleEngine {
    override val puzzleType: Int = 20

    /** Build the flat userValues key for a horizontal wall between (r,c) and (r+1,c). */
    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    /** Build the flat userValues key for a vertical wall between (r,c) and (r,c+1). */
    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    /** A galaxy center in doubled coordinates; [color] 0 = open, 1 = filled. */
    data class Dot(val dr: Int, val dc: Int, val color: Int)

    /** The parsed canon: [rows] x [cols] grid plus its dots. */
    class Board(val rows: Int, val cols: Int, val dots: List<Dot>)

    /** Parse width/height/dots from a puzzle's canonRepr; missing/invalid -> empty board. */
    fun parseBoard(puzzle: Puzzle): Board {
        val canon = puzzle.canonRepr
        val cols = (canon["width"] as? JsonPrimitive)?.intOrNull ?: 0
        val rows = (canon["height"] as? JsonPrimitive)?.intOrNull ?: 0
        val dots = (canon["dots"] as? JsonArray)?.mapNotNull { el ->
            val obj = el as? JsonObject ?: return@mapNotNull null
            val dr = (obj["dr"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val dc = (obj["dc"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val color = (obj["color"] as? JsonPrimitive)?.intOrNull ?: 0
            Dot(dr, dc, color)
        } ?: emptyList()
        return Board(rows.coerceAtLeast(0), cols.coerceAtLeast(0), dots)
    }

    /** h: (rows-1) x cols, v: rows x (cols-1) — 1 = a drawn wall. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>)

    /** Materialize the h/v wall grids from the flat userValues map (a wall is present when its key maps to 1). */
    fun edges(board: Board, userValues: Map<String, Int>): Edges {
        val rows = board.rows
        val cols = board.cols
        val h = Array(if (rows > 0) rows - 1 else 0) { IntArray(cols) }
        val v = Array(rows) { IntArray(if (cols > 0) cols - 1 else 0) }
        for ((key, value) in userValues) {
            if (value != 1) continue
            when {
                key.startsWith("h:") -> {
                    val (r, c) = parseRC(key.removePrefix("h:")) ?: continue
                    if (r in 0 until rows - 1 && c in 0 until cols) h[r][c] = 1
                }
                key.startsWith("v:") -> {
                    val (r, c) = parseRC(key.removePrefix("v:")) ?: continue
                    if (r in 0 until rows && c in 0 until cols - 1) v[r][c] = 1
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
        val e = edges(parseBoard(puzzle), userValues)
        fun grid(rowsArr: Array<IntArray>) = JsonArray(rowsArr.map { row ->
            JsonArray(row.map { JsonPrimitive(it) })
        })
        return JsonObject(
            mapOf("edges" to JsonObject(mapOf("h" to grid(e.h), "v" to grid(e.v)))),
        )
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        val result = mutableMapOf<String, Int>()
        val edgesObj = answer["edges"] as? JsonObject
        (edgesObj?.get("h") as? JsonArray)?.let { h ->
            for (r in 0 until rows - 1) {
                val rowArr = h.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[hKey(r, c)] = 1
                }
            }
        }
        (edgesObj?.get("v") as? JsonArray)?.let { v ->
            for (r in 0 until rows) {
                val rowArr = v.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols - 1) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[vKey(r, c)] = 1
                }
            }
        }
        return result
    }

    /**
     * Flood-fill the grid into regions across edges with no wall (port of
     * TentaishowBoard.tsx computeRegions). Returns a rows x cols grid of region ids.
     */
    fun computeRegions(rows: Int, cols: Int, e: Edges): Array<IntArray> {
        val ids = Array(rows) { IntArray(cols) { -1 } }
        var nextId = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (ids[r][c] >= 0) continue
                val id = nextId++
                val stack = ArrayDeque<Pair<Int, Int>>()
                ids[r][c] = id
                stack.addLast(r to c)
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    if (cr > 0 && ids[cr - 1][cc] < 0 && e.h[cr - 1][cc] == 0) {
                        ids[cr - 1][cc] = id; stack.addLast(cr - 1 to cc)
                    }
                    if (cr < rows - 1 && ids[cr + 1][cc] < 0 && e.h[cr][cc] == 0) {
                        ids[cr + 1][cc] = id; stack.addLast(cr + 1 to cc)
                    }
                    if (cc > 0 && ids[cr][cc - 1] < 0 && e.v[cr][cc - 1] == 0) {
                        ids[cr][cc - 1] = id; stack.addLast(cr to cc - 1)
                    }
                    if (cc < cols - 1 && ids[cr][cc + 1] < 0 && e.v[cr][cc] == 0) {
                        ids[cr][cc + 1] = id; stack.addLast(cr to cc + 1)
                    }
                }
            }
        }
        return ids
    }

    /** Cell indices a doubled coordinate touches: odd -> one cell, even -> the two either side. */
    private fun dotCells(d: Int): List<Int> = if (d % 2 == 1) listOf((d - 1) / 2) else listOf(d / 2 - 1, d / 2)

    /**
     * Region id of each dot, or -1 when the dot straddles a wall (its touching cells lie in
     * different regions) or sits out of bounds (port of assignDotsToRegions).
     */
    fun assignDotsToRegions(board: Board, regionIds: Array<IntArray>): IntArray =
        IntArray(board.dots.size) { i ->
            val dot = board.dots[i]
            var region = -1
            for (r in dotCells(dot.dr)) {
                for (c in dotCells(dot.dc)) {
                    if (r !in 0 until board.rows || c !in 0 until board.cols) return@IntArray -1
                    val id = regionIds[r][c]
                    if (region == -1) region = id else if (region != id) return@IntArray -1
                }
            }
            region
        }

    /**
     * Region id -> its single dot's color, for every region that contains exactly one dot.
     * This is what the board shades (and the thumbnail paints): an enclosed single-dot
     * region takes its dot's color, everything else stays unshaded.
     */
    fun singleDotRegionColors(board: Board, regionIds: Array<IntArray>): Map<Int, Int> {
        val dotRegion = assignDotsToRegions(board, regionIds)
        val count = HashMap<Int, Int>()
        for (id in dotRegion) if (id >= 0) count[id] = (count[id] ?: 0) + 1
        val colors = HashMap<Int, Int>()
        board.dots.forEachIndexed { i, dot ->
            val id = dotRegion[i]
            if (id >= 0 && count[id] == 1) colors[id] = dot.color
        }
        return colors
    }

    /**
     * Progress = (cells in a region containing exactly one dot / total cells) * 100.
     * Mirrors frontend/src/progress/tentaishow.ts; symmetry isn't required to count.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows < 1 || cols < 1) return 0.0
        val regionIds = computeRegions(rows, cols, edges(board, userValues))
        val colors = singleDotRegionColors(board, regionIds)
        var assigned = 0
        for (r in 0 until rows) for (c in 0 until cols) if (regionIds[r][c] in colors) assigned++
        return assigned.toDouble() / (rows * cols) * 100.0
    }

    /**
     * True when the walls form a valid galaxy partition (port of TentaishowBoard.tsx
     * validateSolution):
     *  1. every dot sits cleanly inside one region (no wall through it),
     *  2. every region contains exactly one dot,
     *  3. every cell's 180° partner about its region's dot is in bounds and in the same region.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0 || board.dots.isEmpty()) return false
        val regionIds = computeRegions(rows, cols, edges(board, userValues))

        val dotRegion = assignDotsToRegions(board, regionIds)
        if (dotRegion.any { it < 0 }) return false

        val count = HashMap<Int, Int>()
        for (id in dotRegion) count[id] = (count[id] ?: 0) + 1
        for (r in 0 until rows) for (c in 0 until cols) if (count[regionIds[r][c]] != 1) return false

        val regionDot = HashMap<Int, Dot>()
        board.dots.forEachIndexed { i, dot -> regionDot[dotRegion[i]] = dot }

        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val dot = regionDot.getValue(regionIds[r][c])
                // Rotating cell center (2r+1, 2c+1) 180° about (dr, dc) lands on
                // (2*dr - 2r - 1, ...), i.e. cell (dr - r - 1, dc - c - 1).
                val pr = dot.dr - r - 1
                val pc = dot.dc - c - 1
                if (pr !in 0 until rows || pc !in 0 until cols) return false
                if (regionIds[pr][pc] != regionIds[r][c]) return false
            }
        }
        return true
    }

    /**
     * The solved picture: each cell painted its galaxy's dot color (white or black), the
     * way the web board's thumbnail reveals the emerging image. Cells outside a
     * single-dot region fall back to the light-grey ground.
     */
    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return null
        return PuzzleThumbnail(
            width = board.cols,
            height = board.rows,
            cells = pictureCells(board, restoreUserValues(puzzle, answer)),
        )
    }

    /** Row-major packed-ARGB picture of the current regions (shared by board preview + thumbnail). */
    fun pictureCells(board: Board, userValues: Map<String, Int>): IntArray {
        val regionIds = computeRegions(board.rows, board.cols, edges(board, userValues))
        val colors = singleDotRegionColors(board, regionIds)
        return IntArray(board.rows * board.cols) { i ->
            when (colors[regionIds[i / board.cols][i % board.cols]]) {
                1 -> REGION_BLACK_ARGB
                0 -> REGION_WHITE_ARGB
                else -> GROUND_ARGB
            }
        }
    }

    /** Fills matching the web board: #111 for black-dot galaxies, #fff for white-dot ones. */
    const val REGION_BLACK_ARGB: Int = 0xFF111111.toInt()
    const val REGION_WHITE_ARGB: Int = 0xFFFFFFFF.toInt()

    /** The web board's #eee ground for cells not yet in a single-dot region. */
    const val GROUND_ARGB: Int = 0xFFEEEEEE.toInt()
}
