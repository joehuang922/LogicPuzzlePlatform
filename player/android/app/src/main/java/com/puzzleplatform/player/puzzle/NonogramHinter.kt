package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle

/**
 * Offline Nonogram hint engine — the Kotlin port of player/solver/src/plugins/nonogram
 * (model.ts `solveLine`/`propagate` + board.ts + techniques.ts).
 *
 * Runs entirely on-device: given the clues plus the player's marks, it walks a
 * depth-ordered technique ladder and returns the shallowest step that fires. Nonogram
 * reasoning is about lines, so most steps point at one row or column whose clue settles
 * cells given the marks so far. Every step also carries the cells it settles
 * ([Step.placements], client marks: 1 fill, 2 cross) so the UI can show or apply them.
 * Returns null when no rung applies — the caller falls back to [reveal].
 *
 * Hints take the player's marks as correct (like [SudokuHinter]). Cell ids are the solver
 * convention `row * cols + col`; lines are 0..rows-1 for rows, then rows.. for columns.
 */
object NonogramHinter {

    // Solver cell states (model.ts).
    private const val UNKNOWN = -1
    private const val EMPTY = 0
    private const val FILLED = 1

    /** A row ([isRow]) or column to look at; [index] is 0-based. */
    data class Line(val isRow: Boolean, val index: Int)

    /** A cell a step settles, as a client mark ([NonogramEngine.FILLED] / [NonogramEngine.CROSSED]). */
    data class Placement(val cell: Int, val value: Int)

    /** A single hint. Mirrors the TS `Step` (focusLines + placements). */
    data class Step(
        val technique: String,
        val focusLines: List<Line>,
        val placements: List<Placement>,
        val explanation: String,
        val depth: Int,
    )

    /** The next hint for [puzzle] from the player's marks, or null when the ladder finds none. */
    fun nextHint(puzzle: Puzzle, userValues: Map<String, Int>): Step? {
        val clues = NonogramEngine.parseClues(puzzle)
        return nextHint(clues.rowClues, clues.colClues, userValues)
    }

    fun nextHint(rowClues: List<List<Int>>, colClues: List<List<Int>>, userValues: Map<String, Int>): Step? {
        val board = Board(rowClues, colClues, userValues)
        return lineContradiction(board)
            ?: lineComplete(board)
            ?: lineOverlap(board)
            ?: lineEmpties(board)
            ?: twoLines(board)
    }

    /**
     * The solution-backed "give up" fallback: reveal the first unmarked cell from the
     * stored solution. Null when the puzzle has no solution or every cell is marked.
     */
    fun reveal(puzzle: Puzzle, userValues: Map<String, Int>): Step? {
        val clues = NonogramEngine.parseClues(puzzle)
        return reveal(clues.rowClues, clues.colClues, userValues, NonogramEngine.parseSolution(puzzle))
    }

    fun reveal(
        rowClues: List<List<Int>>,
        colClues: List<List<Int>>,
        userValues: Map<String, Int>,
        solution: Array<IntArray>?,
    ): Step? {
        if (solution == null) return null
        val board = Board(rowClues, colClues, userValues)
        for (id in board.state.indices) {
            val r = id / board.cols
            val c = id % board.cols
            val want = solution.getOrNull(r)?.getOrNull(c)
            if (board.state[id] != UNKNOWN || (want != 0 && want != 1)) continue
            return Step(
                technique = "reveal",
                focusLines = listOf(Line(true, r), Line(false, c)),
                placements = listOf(Placement(id, toClient(if (want == 1) FILLED else EMPTY))),
                explanation = "No simple next step was found, so here's one cell from the solution: " +
                    "${board.cellLabel(id)} is ${if (want == 1) "filled" else "empty"}.",
                depth = 5,
            )
        }
        return null
    }

    /** "col,row" key for a solver cell id on a board [cols] wide. */
    fun cellKey(cell: Int, cols: Int): String = "${cell % cols},${cell / cols}"

    // -- techniques (techniques.ts) -----------------------------------------------

    /** Depth 0: a line whose marks can't fit its clue — a mistake to fix first. */
    private fun lineContradiction(board: Board): Step? {
        for (l in 0 until board.lineCount) {
            if (board.solved[l] != null) continue
            return Step(
                "line-contradiction", listOf(board.focusLine(l)), emptyList(),
                "${board.lineLabel(l)} can't be completed as marked — one of its marks is wrong.", 0,
            )
        }
        return null
    }

    /** Depth 1: a line with only one arrangement left that fits — it can be finished outright. */
    private fun lineComplete(board: Board): Step? {
        val l = board.bestLine { line, deduced ->
            deduced.size == board.unknownCount(line) && deduced.any { it.value == FILLED }
        }
        if (l < 0) return null
        return board.lineStep(
            l, "line-complete", 1,
            "${board.lineLabel(l)} has only one arrangement that fits the cells marked so far — it can be finished.",
        )
    }

    /** Depth 2: blocks whose every fitting placement overlaps — some cells must be filled. */
    private fun lineOverlap(board: Board): Step? {
        val l = board.bestLine { _, deduced -> deduced.any { it.value == FILLED } }
        if (l < 0) return null
        val n = board.deductions[l].size
        return board.lineStep(
            l, "line-overlap", 2,
            "Look at ${board.lineLabel(l)}: every way its blocks fit the cells marked so far agrees on " +
                "${plural(n, "more cell")}.",
        )
    }

    /** Depth 3: cells no block of the line can reach — they can be crossed out. */
    private fun lineEmpties(board: Board): Step? {
        val l = board.bestLine { _, _ -> true }
        if (l < 0) return null
        val n = board.deductions[l].size
        val text = if (n == board.unknownCount(l)) {
            "${board.lineLabel(l)} already has all its blocks — the rest of it can be crossed out."
        } else {
            "In ${board.lineLabel(l)}, ${plural(n, "cell")} can't be reached by any block — they can be crossed out."
        }
        return board.lineStep(l, "line-empties", 3, text)
    }

    /**
     * Depth 4: no single line settles anything, so look where a row and a column cross:
     * assuming one value for a cell and following the line logic runs into a
     * contradiction, so the cell takes the other value.
     */
    private fun twoLines(board: Board): Step? {
        for (l in 0 until board.lineCount) {
            if (board.solved[l] == null || board.deductions[l].isNotEmpty()) return null
        }
        val cols = board.cols
        fun contradicts(id: Int, v: Int): Boolean {
            val t = board.state.copyOf()
            t[id] = v
            return !board.propagate(t, mutableListOf(id / cols, board.rows + id % cols))
        }
        for (id in board.state.indices) {
            if (board.state[id] != UNKNOWN) continue
            val fillFails = contradicts(id, FILLED)
            val emptyFails = contradicts(id, EMPTY)
            if (!fillFails && !emptyFails) continue
            if (fillFails && emptyFails) {
                return Step(
                    "inconsistent-marks", emptyList(), emptyList(),
                    "Your marks can't all be right: the row and column logic runs into a contradiction " +
                        "whichever way the next cell goes. Undo back to a point you trust, or check your work.",
                    4,
                )
            }
            val value = if (fillFails) EMPTY else FILLED
            return Step(
                technique = "two-lines",
                focusLines = listOf(Line(true, id / cols), Line(false, id % cols)),
                placements = listOf(Placement(id, toClient(value))),
                explanation = "No single line settles a cell now. Try supposing the cell at ${board.cellLabel(id)} is " +
                    "${if (value == FILLED) "empty" else "filled"}: following its row and column leads to a " +
                    "contradiction, so it must be ${if (value == FILLED) "filled" else "empty"}.",
                depth = 4,
            )
        }
        return null
    }

    private fun plural(n: Int, word: String) = "$n $word${if (n == 1) "" else "s"}"

    private fun toClient(value: Int) = if (value == FILLED) NonogramEngine.FILLED else NonogramEngine.CROSSED

    // -- board (board.ts) -----------------------------------------------------------

    private class Board(rowClues: List<List<Int>>, colClues: List<List<Int>>, values: Map<String, Int>) {
        val rows = rowClues.size
        val cols = colClues.size
        val lineCount = rows + cols
        val blocks: List<IntArray> = (rowClues + colClues).map { clue -> clue.filter { it > 0 }.toIntArray() }
        val lineCells: List<IntArray> =
            List(rows) { r -> IntArray(cols) { c -> r * cols + c } } +
                List(cols) { c -> IntArray(rows) { r -> r * cols + c } }
        val state = IntArray(rows * cols) { id ->
            when (values["${id % cols},${id / cols}"]) {
                NonogramEngine.FILLED -> FILLED
                NonogramEngine.CROSSED -> EMPTY
                else -> UNKNOWN
            }
        }

        /** The line solver's verdict per line; null = contradictory. */
        val solved: List<IntArray?> = List(lineCount) { l -> solveLine(lineCells[l].map { state[it] }.toIntArray(), blocks[l]) }

        /** Per line, the cells it settles that the player hasn't marked yet (solver states). */
        val deductions: List<List<Placement>> = List(lineCount) { l ->
            val s = solved[l] ?: return@List emptyList()
            lineCells[l].withIndex()
                .filter { (i, id) -> state[id] == UNKNOWN && s[i] != UNKNOWN }
                .map { (i, id) -> Placement(id, s[i]) }
        }

        fun unknownCount(l: Int) = lineCells[l].count { state[it] == UNKNOWN }

        /** The line with the most deductions among those [accept] keeps, or -1. */
        fun bestLine(accept: (Int, List<Placement>) -> Boolean): Int {
            var best = -1
            var bestCount = 0
            for (l in 0 until lineCount) {
                val d = deductions[l]
                if (d.isEmpty() || !accept(l, d)) continue
                if (d.size > bestCount) {
                    best = l
                    bestCount = d.size
                }
            }
            return best
        }

        fun lineStep(l: Int, technique: String, depth: Int, explanation: String) = Step(
            technique, listOf(focusLine(l)),
            deductions[l].map { Placement(it.cell, toClient(it.value)) }, explanation, depth,
        )

        fun focusLine(l: Int) = if (l < rows) Line(true, l) else Line(false, l - rows)

        /** "Row 3 (clue 2 1)" — 1-based. */
        fun lineLabel(l: Int): String {
            val name = if (l < rows) "Row ${l + 1}" else "Column ${l - rows + 1}"
            val clue = if (blocks[l].isNotEmpty()) blocks[l].joinToString(" ") else "0"
            return "$name (clue $clue)"
        }

        /** "row 3, column 5" — 1-based. */
        fun cellLabel(id: Int) = "row ${id / cols + 1}, column ${id % cols + 1}"

        /** Line-solve the queued lines to a fixed point, in place. False on contradiction. */
        fun propagate(state: IntArray, queue: MutableList<Int>): Boolean {
            val queued = BooleanArray(lineCount)
            for (l in queue) queued[l] = true
            while (queue.isNotEmpty()) {
                val l = queue.removeAt(queue.size - 1)
                queued[l] = false
                val ids = lineCells[l]
                val out = solveLine(IntArray(ids.size) { state[ids[it]] }, blocks[l]) ?: return false
                for (i in ids.indices) {
                    val id = ids[i]
                    if (out[i] == UNKNOWN || state[id] != UNKNOWN) continue
                    state[id] = out[i]
                    val cross = if (l < rows) rows + id % cols else id / cols
                    if (!queued[cross]) {
                        queued[cross] = true
                        queue.add(cross)
                    }
                }
            }
            return true
        }
    }

    /**
     * The line solver (model.ts `solveLine`): returns the line with every deduction
     * applied — a cell is FILLED (EMPTY) when it is filled (empty) in every placement of
     * [blocks] that agrees with the known cells — or null when no placement agrees.
     *
     * DP over states (block j, position i) = "blocks 0..j-1 are placed and the next may
     * start at i": `suffix[j][i]` says cells i.. can hold blocks j..; a forward sweep over
     * reachable feasible states records, per cell, whether it can be empty or filled.
     */
    internal fun solveLine(cells: IntArray, blocks: IntArray): IntArray? {
        val n = cells.size
        val k = blocks.size
        val emptyBefore = IntArray(n + 1)
        for (i in 0 until n) emptyBefore[i + 1] = emptyBefore[i] + if (cells[i] == EMPTY) 1 else 0
        fun canFill(from: Int, to: Int) = to <= n && emptyBefore[to] - emptyBefore[from] == 0

        val suffix = Array(k + 1) { BooleanArray(n + 2) }
        suffix[k][n] = true
        for (i in n - 1 downTo 0) suffix[k][i] = cells[i] != FILLED && suffix[k][i + 1]
        for (j in k - 1 downTo 0) {
            for (i in n downTo 0) {
                if (i < n && cells[i] != FILLED && suffix[j][i + 1]) {
                    suffix[j][i] = true
                    continue
                }
                val end = i + blocks[j]
                if (!canFill(i, end)) continue
                suffix[j][i] = if (end == n) j + 1 == k else cells[end] != FILLED && suffix[j + 1][end + 1]
            }
        }
        if (!suffix[0][0]) return null

        val reach = Array(k + 1) { BooleanArray(n + 2) }
        reach[0][0] = true
        val fillDiff = IntArray(n + 1)
        val seenEmpty = BooleanArray(n)
        for (i in 0 until n) {
            for (j in 0..k) {
                if (!reach[j][i]) continue
                if (cells[i] != FILLED && suffix[j][i + 1]) {
                    seenEmpty[i] = true
                    reach[j][i + 1] = true
                }
                if (j == k) continue
                val end = i + blocks[j]
                if (!canFill(i, end)) continue
                if (end == n) {
                    if (j + 1 == k) {
                        fillDiff[i]++
                        fillDiff[end]--
                    }
                } else if (cells[end] != FILLED && suffix[j + 1][end + 1]) {
                    fillDiff[i]++
                    fillDiff[end]--
                    seenEmpty[end] = true
                    reach[j + 1][end + 1] = true
                }
            }
        }

        val out = IntArray(n)
        var filledRun = 0
        for (i in 0 until n) {
            filledRun += fillDiff[i]
            val mayFill = filledRun > 0
            out[i] = when {
                mayFill && seenEmpty[i] -> UNKNOWN
                mayFill -> FILLED
                seenEmpty[i] -> EMPTY
                else -> return null
            }
        }
        return out
    }
}
