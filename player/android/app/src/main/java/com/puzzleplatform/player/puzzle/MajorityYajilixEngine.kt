package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Majority Yajilix (puzzle type 47). Ports frontend/src/components/majorityYajilixRules.ts,
 * the extractor (frontend/src/extractors/majorityYajilix.ts) and progress
 * (frontend/src/progress/majorityYajilix.ts).
 *
 * canonRepr: { cells }: rows x cols, null = empty cell, { kind: "L"|"I"|"X", dir } = a
 * clue whose letter is the class (L turn, I straight, X off the loop) with strictly the
 * most of the non-clue cells from it to the edge in `dir`.
 *
 * Board, userValues and answer are [YajilixEngine]'s (its clues here have no number).
 */
object MajorityYajilixEngine : ShadeMarkEngine {
    override val puzzleType: Int = 47

    override fun cellKey(col: Int, row: Int): String = YajilixEngine.cellKey(col, row)

    fun parseBoard(puzzle: Puzzle): YajilixEngine.Board = YajilixEngine.parseBoard(puzzle)

    /** The class of every cell on a finished loop, counted. */
    private fun finishedCounts(loop: CountryRoadEngine.Loop, deg: Array<IntArray>, cells: List<Pair<Int, Int>>): Map<Char, Int> {
        val shapes = cells.map { (r, c) -> YajilixEngine.shape(loop, deg, r, c) }
        return YajilixEngine.KINDS.associateWith { k -> shapes.count { it == YajilixEngine.wanted(k) } }
    }

    /** Whether the clue at (r, c) holds on a finished loop (web: clueHolds). */
    fun clueHolds(board: YajilixEngine.Board, loop: CountryRoadEngine.Loop, deg: Array<IntArray>, r: Int, c: Int): Boolean {
        val clue = board.clue(r, c) ?: return true
        val n = finishedCounts(loop, deg, YajilixEngine.lineCells(board, r, c, clue.dir))
        return YajilixEngine.KINDS.all { k -> k == clue.kind || n.getValue(clue.kind) > n.getValue(k) }
    }

    /** One closed loop avoiding every clue cell, every clue's class alone on top (web: validateMajorityYajilix). */
    fun solved(board: YajilixEngine.Board, loop: CountryRoadEngine.Loop): Boolean {
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0 || !CountryRoadEngine.isSingleLoop(rows, cols, loop)) return false
        val deg = CountryRoadEngine.degrees(rows, cols, loop)
        for (r in 0 until rows) for (c in 0 until cols) {
            if (!board.isClue(r, c)) continue
            if (deg[r][c] != 0 || !clueHolds(board, loop, deg, r, c)) return false
        }
        return true
    }

    /** The clue's class can no longer beat a class's certain cells (web: clueBroken). */
    fun clueBroken(
        board: YajilixEngine.Board,
        loop: CountryRoadEngine.Loop,
        marks: Array<IntArray>,
        deg: Array<IntArray>,
        r: Int,
        c: Int,
    ): Boolean {
        val clue = board.clue(r, c) ?: return false
        val n = YajilixEngine.classCounts(loop, marks, deg, YajilixEngine.lineCells(board, r, c, clue.dir))
        val own = n.getValue(clue.kind).possible
        return YajilixEngine.KINDS.any { k -> k != clue.kind && own <= n.getValue(k).certain }
    }

    fun brokenClues(board: YajilixEngine.Board, userValues: Map<String, Int>): YajilixEngine.Broken =
        YajilixEngine.brokenLoopClues(board, userValues) { loop, marks, deg, r, c -> clueBroken(board, loop, marks, deg, r, c) }

    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? = YajilixEngine.shadeGroup(puzzle, col, row)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject =
        YajilixEngine.extractAnswer(puzzle, userValues)

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> =
        YajilixEngine.restoreUserValues(puzzle, answer)

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double =
        YajilixEngine.computeProgress(puzzle, userValues)

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return solved(board, CountryRoadEngine.loop(board.rows, board.cols, userValues))
    }
}
