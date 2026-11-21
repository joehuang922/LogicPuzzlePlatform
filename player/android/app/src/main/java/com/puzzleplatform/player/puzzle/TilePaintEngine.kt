package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Tile Paint (puzzle type 40). Ports frontend/src/components/tilePaintRules.ts, the
 * extractor (frontend/src/extractors/tilePaint.ts) and progress
 * (frontend/src/progress/tilePaint.ts).
 *
 * canonRepr: { cells, grids: { h, v } }
 *   - cells: rows x cols; null = tile cell, { right, down } = a Kakuro-style clue cell
 *     counting the shaded cells of its run to the right / below (null = no number).
 *   - grids.h: (rows-1) x cols, 1 = wall below cell (r, c); grids.v: rows x (cols-1).
 *     Edges beside a clue cell are ignored when tiles are built.
 *
 * Tiles (tile cells joined across open edges) are shaded whole: a tap cycles the tapped
 * cell's tile ([shadeGroup]); clue cells take no input. userValues "col,row" -> 1 shaded /
 * 2 marked, every cell of a tile carrying the tile's state.
 *
 * answer: { states: rows x cols } (0 unset, 1 shaded, 2 marked; clue cells 0).
 */
object TilePaintEngine : ShadeMarkEngine {
    override val puzzleType: Int = 40

    const val UNSET = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** A clue cell's numbers (null = none). */
    data class Clue(val right: Int? = null, val down: Int? = null)

    /** cells[r][c] is null for a tile cell. h / v as in the canon. */
    data class Board(
        val cells: List<List<Clue?>>,
        val h: List<List<Int>>,
        val v: List<List<Int>>,
    ) {
        val rows: Int get() = cells.size
        val cols: Int get() = cells.firstOrNull()?.size ?: 0

        fun isTile(r: Int, c: Int): Boolean = r in 0 until rows && c in 0 until cols && cells[r][c] == null

        /** Wall drawn under (r, c): always beside a clue cell (vs a tile), never between clues. */
        fun wallBelow(r: Int, c: Int): Boolean {
            val a = isTile(r, c)
            val b = isTile(r + 1, c)
            if (a != b) return true
            if (!a) return false
            return h.getOrNull(r)?.getOrNull(c) == 1
        }

        fun wallRight(r: Int, c: Int): Boolean {
            val a = isTile(r, c)
            val b = isTile(r, c + 1)
            if (a != b) return true
            if (!a) return false
            return v.getOrNull(r)?.getOrNull(c) == 1
        }
    }

    /** A clue number and the tile cells (row, col) of its run. */
    data class Run(val r: Int, val c: Int, val right: Boolean, val value: Int, val cells: List<Pair<Int, Int>>)

    fun parseBoard(puzzle: Puzzle): Board = boardFromCanon(puzzle.canonRepr)

    fun boardFromCanon(canon: JsonObject): Board {
        val grids = canon["grids"] as? JsonObject
        val cells = (canon["cells"] as? JsonArray)?.map { rowEl ->
            (rowEl as? JsonArray)?.map { cell ->
                val obj = cell as? JsonObject
                if (obj == null) null else Clue(number(obj["right"]), number(obj["down"]))
            } ?: emptyList()
        } ?: emptyList()
        return Board(cells, intGrid(grids?.get("h")), intGrid(grids?.get("v")))
    }

    fun canonOf(board: Board): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(board.cells.map { row ->
                JsonArray(row.map { clue ->
                    if (clue == null) {
                        JsonNull
                    } else {
                        JsonObject(
                            mapOf(
                                "right" to (clue.right?.let { JsonPrimitive(it) } ?: JsonNull),
                                "down" to (clue.down?.let { JsonPrimitive(it) } ?: JsonNull),
                            )
                        )
                    }
                })
            }),
            "grids" to JsonObject(
                mapOf(
                    "h" to JsonArray(board.h.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }),
                    "v" to JsonArray(board.v.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }),
                )
            ),
        )
    )

    private fun number(el: JsonElement?): Int? = (el as? JsonPrimitive)?.intOrNull

    private fun intGrid(el: JsonElement?): List<List<Int>> =
        (el as? JsonArray)?.map { row -> (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList() }
            ?: emptyList()

    /** Tile id per cell (-1 for clue cells) and the tile count. */
    fun tiles(board: Board): Pair<Array<IntArray>, Int> {
        val rows = board.rows
        val cols = board.cols
        val ids = Array(rows) { IntArray(cols) { -1 } }
        var count = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!board.isTile(r, c) || ids[r][c] >= 0) continue
                ids[r][c] = count
                val stack = ArrayDeque<Pair<Int, Int>>()
                stack.addLast(r to c)
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    val next = listOf(
                        Triple(cr - 1, cc, cr > 0 && board.h.getOrNull(cr - 1)?.getOrNull(cc) == 0),
                        Triple(cr + 1, cc, cr < rows - 1 && board.h.getOrNull(cr)?.getOrNull(cc) == 0),
                        Triple(cr, cc - 1, cc > 0 && board.v.getOrNull(cr)?.getOrNull(cc - 1) == 0),
                        Triple(cr, cc + 1, cc < cols - 1 && board.v.getOrNull(cr)?.getOrNull(cc) == 0),
                    )
                    for ((nr, nc, open) in next) {
                        if (open && board.isTile(nr, nc) && ids[nr][nc] < 0) {
                            ids[nr][nc] = count
                            stack.addLast(nr to nc)
                        }
                    }
                }
                count++
            }
        }
        return ids to count
    }

    fun runs(board: Board): List<Run> {
        val out = ArrayList<Run>()
        for (r in 0 until board.rows) {
            for (c in 0 until board.cols) {
                val clue = board.cells[r][c] ?: continue
                for (right in listOf(true, false)) {
                    val value = (if (right) clue.right else clue.down) ?: continue
                    val (dr, dc) = if (right) 0 to 1 else 1 to 0
                    val cells = ArrayList<Pair<Int, Int>>()
                    var rr = r + dr
                    var cc = c + dc
                    while (board.isTile(rr, cc)) {
                        cells.add(rr to cc)
                        rr += dr
                        cc += dc
                    }
                    out.add(Run(r, c, right, value, cells))
                }
            }
        }
        return out
    }

    private fun state(userValues: Map<String, Int>, r: Int, c: Int): Int =
        when (val v = userValues[cellKey(c, r)]) {
            SHADED, MARKED -> v
            else -> UNSET
        }

    /** Every clue's run holds exactly its number of shaded cells. */
    fun solved(board: Board, userValues: Map<String, Int>): Boolean =
        runs(board).all { run -> run.cells.count { (r, c) -> state(userValues, r, c) == SHADED } == run.value }

    /** Clues the decided cells already break, as (row, col, right?). */
    fun brokenClues(board: Board, userValues: Map<String, Int>): Set<Triple<Int, Int, Boolean>> {
        val out = HashSet<Triple<Int, Int, Boolean>>()
        for (run in runs(board)) {
            var shaded = 0
            var open = 0
            for ((r, c) in run.cells) {
                when (state(userValues, r, c)) {
                    SHADED -> shaded++
                    UNSET -> open++
                }
            }
            if (shaded > run.value || shaded + open < run.value) out.add(Triple(run.r, run.c, run.right))
        }
        return out
    }

    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? {
        val board = parseBoard(puzzle)
        if (!board.isTile(row, col)) return null
        val (ids, _) = tiles(board)
        val id = ids[row][col]
        val cells = ArrayList<Pair<Int, Int>>()
        for (r in 0 until board.rows) for (c in 0 until board.cols) if (ids[r][c] == id) cells.add(c to r)
        return ShadeGroup(cells)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val states = JsonArray((0 until board.rows).map { r ->
            JsonArray((0 until board.cols).map { c ->
                JsonPrimitive(if (board.isTile(r, c)) state(userValues, r, c) else UNSET)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /** Tiles shaded or marked over all tiles, 0-100 (web: tilePaintProgress). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val (ids, count) = tiles(board)
        if (count == 0) return 0.0
        val decided = HashSet<Int>()
        for (r in 0 until board.rows) {
            for (c in 0 until board.cols) {
                if (ids[r][c] >= 0 && state(userValues, r, c) != UNSET) decided.add(ids[r][c])
            }
        }
        return decided.size.toDouble() / count * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val states = answer["states"] as? JsonArray ?: return emptyMap()
        val out = HashMap<String, Int>()
        states.forEachIndexed { r, rowEl ->
            (rowEl as? JsonArray)?.forEachIndexed { c, el ->
                val v = (el as? JsonPrimitive)?.intOrNull
                if (v == SHADED || v == MARKED) out[cellKey(c, r)] = v
            }
        }
        return out
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return false
        return solved(board, userValues)
    }

    /** First picture row / column: a leading row or column made only of clue cells is dropped. */
    fun pictureOrigin(board: Board): Pair<Int, Int> {
        if (board.rows == 0 || board.cols == 0) return 0 to 0
        val r0 = if (board.rows > 1 && board.cells[0].all { it != null }) 1 else 0
        val c0 = if (board.cols > 1 && board.cells.all { it[0] != null }) 1 else 0
        return r0 to c0
    }

    /** The picture area: shaded black, marked white, undecided ground, inner clue cells white. */
    fun pictureCells(board: Board, userValues: Map<String, Int>): Triple<IntArray, Int, Int> {
        val (r0, c0) = pictureOrigin(board)
        val rows = board.rows - r0
        val cols = board.cols - c0
        val cells = IntArray(rows * cols) { i ->
            val r = i / cols + r0
            val c = i % cols + c0
            if (!board.isTile(r, c)) {
                MARK_ARGB
            } else {
                when (state(userValues, r, c)) {
                    SHADED -> FILL_ARGB
                    MARKED -> MARK_ARGB
                    else -> GROUND_ARGB
                }
            }
        }
        return Triple(cells, rows, cols)
    }

    const val FILL_ARGB: Int = 0xFF000000.toInt()
    const val MARK_ARGB: Int = 0xFFFFFFFF.toInt()
    const val GROUND_ARGB: Int = 0xFFD9D9D9.toInt()

    /** Solved picture: shaded black, everything else white. */
    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return null
        val (cells, rows, cols) = pictureCells(board, restoreUserValues(puzzle, answer))
        val picture = IntArray(cells.size) { if (cells[it] == FILL_ARGB) FILL_ARGB else MARK_ARGB }
        return PuzzleThumbnail(width = cols, height = rows, cells = picture)
    }
}
