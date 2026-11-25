package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Yajilix (puzzle type 46). Ports frontend/src/components/yajilixRules.ts, the extractor
 * (frontend/src/extractors/yajilix.ts) and progress (frontend/src/progress/yajilix.ts).
 *
 * canonRepr: { cells }: rows x cols, null = empty cell, { kind: "L"|"I"|"X", num, dir }
 * = a clue counting, among the non-clue cells from it to the edge in `dir`, the cells
 * where the loop turns (L), goes straight (I) or doesn't go (X).
 *
 * userValues and answer are Country Road's: "h:r,c" / "v:r,c" loop segments and "m:r,c"
 * marks (1 ×, 2 •) riding the shared shade/mark tap cycle; answer { edges: { h, v }, marks }.
 * The loop and value helpers are [CountryRoadEngine]'s.
 */
object YajilixEngine : ShadeMarkEngine {
    override val puzzleType: Int = 46

    const val CROSS = CountryRoadEngine.CROSS
    const val DOT = CountryRoadEngine.DOT

    override fun cellKey(col: Int, row: Int): String = CountryRoadEngine.cellKey(col, row)

    fun hKey(r: Int, c: Int): String = CountryRoadEngine.hKey(r, c)

    fun vKey(r: Int, c: Int): String = CountryRoadEngine.vKey(r, c)

    enum class Dir(val dr: Int, val dc: Int, val json: String, val arrow: String) {
        UP(-1, 0, "up", "↑"),
        RIGHT(0, 1, "right", "→"),
        DOWN(1, 0, "down", "↓"),
        LEFT(0, -1, "left", "←");

        companion object {
            fun fromJson(s: String?): Dir? = entries.firstOrNull { it.json == s }
        }
    }

    val KINDS = listOf('L', 'I', 'X')

    data class Clue(val kind: Char, val num: Int, val dir: Dir) {
        val label: String get() = "$kind$num${dir.arrow}"
    }

    data class Board(val cells: List<List<Clue?>>) {
        val rows: Int get() = cells.size
        val cols: Int get() = cells.firstOrNull()?.size ?: 0

        fun clue(r: Int, c: Int): Clue? = cells.getOrNull(r)?.getOrNull(c)

        fun isClue(r: Int, c: Int): Boolean = clue(r, c) != null
    }

    fun parseBoard(puzzle: Puzzle): Board = boardFromCanon(puzzle.canonRepr)

    fun boardFromCanon(canon: JsonObject): Board = Board(
        (canon["cells"] as? JsonArray)?.map { row -> (row as? JsonArray)?.map { clueOf(it as? JsonObject) } ?: emptyList() }
            ?: emptyList()
    )

    private fun clueOf(o: JsonObject?): Clue? {
        o ?: return null
        val kind = (o["kind"] as? JsonPrimitive)?.contentOrNull?.singleOrNull()?.takeIf { it in KINDS } ?: return null
        val num = (o["num"] as? JsonPrimitive)?.intOrNull?.takeIf { it >= 0 } ?: return null
        val dir = Dir.fromJson((o["dir"] as? JsonPrimitive)?.contentOrNull) ?: return null
        return Clue(kind, num, dir)
    }

    fun canonOf(board: Board): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(board.cells.map { row ->
                JsonArray(row.map { clue ->
                    if (clue == null) JsonNull
                    else JsonObject(
                        mapOf(
                            "kind" to JsonPrimitive(clue.kind.toString()),
                            "num" to JsonPrimitive(clue.num),
                            "dir" to JsonPrimitive(clue.dir.json),
                        )
                    )
                })
            })
        )
    )

    /** The non-clue cells (r, c) from (r, c) to the edge in [dir]; clue cells are skipped. */
    fun lineCells(board: Board, r: Int, c: Int, dir: Dir): List<Pair<Int, Int>> = buildList {
        var rr = r + dir.dr
        var cc = c + dir.dc
        while (rr in 0 until board.rows && cc in 0 until board.cols) {
            if (!board.isClue(rr, cc)) add(rr to cc)
            rr += dir.dr
            cc += dir.dc
        }
    }

    enum class Shape { NONE, TURN, STRAIGHT, OPEN }

    fun shape(loop: CountryRoadEngine.Loop, deg: Array<IntArray>, r: Int, c: Int): Shape {
        val d = deg[r][c]
        if (d == 0) return Shape.NONE
        if (d != 2) return Shape.OPEN
        val left = c > 0 && loop.h[r][c - 1] == 1
        val right = c < loop.h[r].size && loop.h[r][c] == 1
        return if (left == right) Shape.STRAIGHT else Shape.TURN
    }

    private fun wanted(kind: Char): Shape = when (kind) {
        'L' -> Shape.TURN
        'I' -> Shape.STRAIGHT
        else -> Shape.NONE
    }

    /** The clue's count on the loop (web: clueCount). */
    fun clueCount(board: Board, loop: CountryRoadEngine.Loop, r: Int, c: Int): Int {
        val clue = board.clue(r, c) ?: return 0
        val deg = CountryRoadEngine.degrees(board.rows, board.cols, loop)
        val want = wanted(clue.kind)
        return lineCells(board, r, c, clue.dir).count { (rr, cc) -> shape(loop, deg, rr, cc) == want }
    }

    /** One closed loop avoiding every clue cell, every count right (web: validateYajilix). */
    fun solved(board: Board, loop: CountryRoadEngine.Loop): Boolean {
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0 || !CountryRoadEngine.isSingleLoop(rows, cols, loop)) return false
        val deg = CountryRoadEngine.degrees(rows, cols, loop)
        for (r in 0 until rows) for (c in 0 until cols) {
            val clue = board.clue(r, c) ?: continue
            if (deg[r][c] != 0 || clueCount(board, loop, r, c) != clue.num) return false
        }
        return true
    }

    /** Whether the committed cells already break the clue at (r, c) (web: clueBroken). */
    fun clueBroken(board: Board, loop: CountryRoadEngine.Loop, marks: Array<IntArray>, deg: Array<IntArray>, r: Int, c: Int): Boolean {
        val clue = board.clue(r, c) ?: return false
        val cells = lineCells(board, r, c, clue.dir)
        if (clue.kind == 'X') {
            val crossed = cells.count { (rr, cc) -> marks[rr][cc] == CROSS && deg[rr][cc] == 0 }
            val free = cells.count { (rr, cc) -> deg[rr][cc] == 0 }
            return crossed > clue.num || free < clue.num
        }
        val want = wanted(clue.kind)
        var have = 0
        var possible = 0
        for ((rr, cc) in cells) {
            val s = shape(loop, deg, rr, cc)
            when {
                s == want -> { have++; possible++ }
                s == Shape.OPEN && deg[rr][cc] == 1 -> possible++
                s == Shape.NONE && marks[rr][cc] != CROSS -> possible++
            }
        }
        return have > clue.num || possible < clue.num
    }

    /** What the player's committed cells already break (web: brokenClues). */
    data class Broken(val clues: Set<Pair<Int, Int>>, val cells: Set<Pair<Int, Int>>)

    fun brokenClues(board: Board, userValues: Map<String, Int>): Broken {
        val rows = board.rows
        val cols = board.cols
        val loop = CountryRoadEngine.loop(rows, cols, userValues)
        val marks = CountryRoadEngine.marks(rows, cols, userValues)
        val deg = CountryRoadEngine.degrees(rows, cols, loop)
        val clues = HashSet<Pair<Int, Int>>()
        val cells = HashSet<Pair<Int, Int>>()
        for (r in 0 until rows) for (c in 0 until cols) {
            val isClue = board.isClue(r, c)
            if ((isClue && deg[r][c] > 0) || deg[r][c] > 2) cells.add(r to c)
            if (isClue && clueBroken(board, loop, marks, deg, r, c)) clues.add(r to c)
        }
        return Broken(clues, cells)
    }

    /** A clue cell takes no mark. */
    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? =
        if (parseBoard(puzzle).isClue(row, col)) null else ShadeGroup(listOf(col to row))

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject =
        CountryRoadEngine.extractAnswer(puzzle.copy(canonRepr = gridShape(puzzle)), userValues)

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> =
        CountryRoadEngine.restoreUserValues(puzzle, answer)

    /** Country Road reads only the canon's `cells` size; give it a grid of 0s the same shape. */
    private fun gridShape(puzzle: Puzzle): JsonObject {
        val b = parseBoard(puzzle)
        return JsonObject(
            mapOf("cells" to JsonArray(List(b.rows) { JsonArray(List(b.cols) { JsonPrimitive(0) }) }))
        )
    }

    /** Empty cells touched by a segment or carrying a mark, over all empty cells (web: yajilixProgress). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        val deg = CountryRoadEngine.degrees(rows, cols, CountryRoadEngine.loop(rows, cols, userValues))
        val marks = CountryRoadEngine.marks(rows, cols, userValues)
        var total = 0
        var decided = 0
        for (r in 0 until rows) for (c in 0 until cols) {
            if (board.isClue(r, c)) continue
            total++
            if (deg[r][c] > 0 || marks[r][c] != 0) decided++
        }
        return if (total == 0) 0.0 else decided.toDouble() / total * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return solved(board, CountryRoadEngine.loop(board.rows, board.cols, userValues))
    }
}
