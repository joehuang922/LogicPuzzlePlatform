package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle

/**
 * Offline pedagogical hint engine for Sudoku — the Kotlin port of
 * player/solver/src/plugins/sudoku (board.ts + techniques.ts + hint.ts).
 *
 * Runs entirely on-device (no network): given the puzzle's givens plus the player's
 * committed entries it derives, per empty cell, the digits still legal by its peers,
 * then walks a depth-ordered technique ladder and returns the shallowest step that
 * fires. Returns null when no rung applies — the caller falls back to a solution-backed
 * "reveal" (see [SudokuEngine] / PlayViewModel). **No backtracker, no gate on device**
 * (plan.md D6); the uniqueness gate stays server-side.
 *
 * Cell ids are the solver convention `row * 9 + col` (so this file matches the TS
 * source line-for-line); convert to the client's "col,row" key with [cellKey].
 */
object SudokuHinter {

    private const val N = 9
    private const val CELLS = 81

    /** A candidate elimination a technique justifies (no placement yet). */
    data class Elimination(val cell: Int, val digits: List<Int>)

    /** A forced placement a technique determines. */
    data class Placement(val cell: Int, val value: Int)

    /**
     * A single pedagogical hint: the shallowest technique that makes progress on the
     * player's current board. Mirrors the TS `Step`. Cell ids are `row * 9 + col`.
     */
    data class Step(
        val technique: String,
        val focusCells: List<Int>,
        val eliminations: List<Elimination> = emptyList(),
        val placement: Placement? = null,
        val explanation: String,
        val depth: Int,
    )

    /** Client cell key ("col,row") for a solver cell id. */
    fun cellKey(id: Int): String = "${id % N},${id / N}"

    /** Human-readable cell label, e.g. id 30 -> "R4C4". */
    fun cellLabel(id: Int): String = "R${id / N + 1}C${id % N + 1}"

    /** Box index (0..8) for a cell id. */
    private fun boxOf(id: Int): Int {
        val r = id / N
        val c = id % N
        return r / 3 * 3 + c / 3
    }

    /** Unit label for an explanation, given the unit's index in [UNITS] (0..26). */
    private fun unitLabel(unitIndex: Int): String = when {
        unitIndex < 9 -> "row ${unitIndex + 1}"
        unitIndex < 18 -> "column ${unitIndex - 9 + 1}"
        else -> "box ${unitIndex - 18 + 1}"
    }

    /**
     * Row/col/box units: 9 rows, then 9 columns, then 9 boxes. Each entry is the 9
     * cell ids of that unit. Matches the TS UNITS ordering exactly so BOX_UNITS /
     * LINE_UNITS slicing lines up.
     */
    private val UNITS: List<IntArray> = buildList {
        for (r in 0 until N) add(IntArray(N) { c -> r * N + c })
        for (c in 0 until N) add(IntArray(N) { r -> r * N + c })
        for (br in 0 until N step 3) {
            for (bc in 0 until N step 3) {
                val box = IntArray(N)
                var k = 0
                for (dr in 0 until 3) for (dc in 0 until 3) box[k++] = (br + dr) * N + (bc + dc)
                add(box)
            }
        }
    }

    private val BOX_UNITS: List<IntArray> = UNITS.subList(18, 27)   // 9 box units, box index 0..8
    private val LINE_UNITS: List<IntArray> = UNITS.subList(0, 18)   // 9 rows then 9 columns

    /** Peers of each cell: the 20 other cells sharing its row, column, or box. */
    private val PEERS: Array<IntArray> = Array(CELLS) { id ->
        val r = id / N
        val c = id % N
        val set = linkedSetOf<Int>()
        for (k in 0 until N) {
            set.add(r * N + k) // row
            set.add(k * N + c) // col
        }
        val br = r / 3 * 3
        val bc = c / 3 * 3
        for (dr in 0 until 3) for (dc in 0 until 3) set.add((br + dr) * N + (bc + dc)) // box
        set.remove(id) // not a peer of itself
        set.toIntArray()
    }

    /**
     * A read-only candidate board for hint reasoning. Combines the puzzle's givens with
     * the player's committed entries and derives, for each empty cell, the digits still
     * legal given its peers. Reasons from committed values only — pencil marks ignored.
     */
    private class Board(val values: IntArray, val candidates: Array<IntArray>) {
        fun isEmpty(id: Int): Boolean = values[id] == 0

        companion object {
            fun build(hints: Array<IntArray>, entered: Map<String, Int>): Board {
                val values = IntArray(CELLS)
                for (r in 0 until N) {
                    for (c in 0 until N) {
                        val id = r * N + c
                        val hint = hints.getOrNull(r)?.getOrNull(c) ?: 0
                        // Givens win; otherwise take the player's entry keyed "col,row".
                        values[id] = if (hint != 0) hint else entered["$c,$r"] ?: 0
                    }
                }
                val candidates = Array(CELLS) { id ->
                    if (values[id] != 0) return@Array IntArray(0)
                    val taken = BooleanArray(N + 1)
                    for (peer in PEERS[id]) if (values[peer] != 0) taken[values[peer]] = true
                    (1..N).filter { !taken[it] }.toIntArray()
                }
                return Board(values, candidates)
            }
        }
    }

    // --- Technique ladder, easiest-first by depth. nextHint returns the first that fires. ---

    /** Depth 0: a cell with exactly one remaining candidate. */
    private fun nakedSingle(board: Board): Step? {
        for (id in 0 until CELLS) {
            if (board.isEmpty(id) && board.candidates[id].size == 1) {
                val value = board.candidates[id][0]
                return Step(
                    technique = "naked-single",
                    focusCells = listOf(id),
                    placement = Placement(id, value),
                    explanation = "${cellLabel(id)} has only one possible digit left: $value.",
                    depth = 0,
                )
            }
        }
        return null
    }

    /** Depth 1: a digit that fits in exactly one cell of some unit. */
    private fun hiddenSingle(board: Board): Step? {
        for (u in UNITS.indices) {
            val unit = UNITS[u]
            for (v in 1..N) {
                val spots = unit.filter { board.isEmpty(it) && v in board.candidates[it] }
                if (spots.size == 1) {
                    // Skip if it's also a naked single (depth 0 would have caught it) to
                    // keep the hint at the correct rung.
                    if (board.candidates[spots[0]].size == 1) continue
                    val id = spots[0]
                    return Step(
                        technique = "hidden-single",
                        focusCells = listOf(id),
                        placement = Placement(id, v),
                        explanation = "In ${unitLabel(u)}, $v can only go in ${cellLabel(id)}.",
                        depth = 1,
                    )
                }
            }
        }
        return null
    }

    /**
     * Depth 2: locked candidates. Within a box, if a digit's only spots all share one
     * row or column, that digit can be removed from the rest of that line (pointing).
     * And if within a line a digit's only spots all share one box, it can be removed
     * from the rest of that box (claiming).
     */
    private fun lockedCandidates(board: Board): Step? {
        // Pointing: box -> line.
        for (b in 0 until N) {
            val box = BOX_UNITS[b]
            for (v in 1..N) {
                val spots = box.filter { board.isEmpty(it) && v in board.candidates[it] }
                if (spots.size < 2) continue
                val rows = spots.map { it / N }.toSet()
                val cols = spots.map { it % N }.toSet()
                var line: IntArray? = null
                var desc = ""
                if (rows.size == 1) {
                    val r = rows.first()
                    line = UNITS[r] // that row
                    desc = "row ${r + 1}"
                } else if (cols.size == 1) {
                    val c = cols.first()
                    line = UNITS[9 + c] // that column
                    desc = "column ${c + 1}"
                }
                if (line == null) continue
                val targets = line.filter {
                    boxOf(it) != b && board.isEmpty(it) && v in board.candidates[it]
                }
                if (targets.isNotEmpty()) {
                    return Step(
                        technique = "locked-candidates",
                        focusCells = spots,
                        eliminations = targets.map { Elimination(it, listOf(v)) },
                        explanation = "In box ${b + 1}, $v is confined to $desc, so $v can be " +
                            "removed from ${targets.joinToString(", ") { cellLabel(it) }}.",
                        depth = 2,
                    )
                }
            }
        }
        // Claiming: line -> box.
        for (u in LINE_UNITS.indices) {
            val line = LINE_UNITS[u]
            for (v in 1..N) {
                val spots = line.filter { board.isEmpty(it) && v in board.candidates[it] }
                if (spots.size < 2) continue
                val boxes = spots.map { boxOf(it) }.toSet()
                if (boxes.size != 1) continue
                val b = boxes.first()
                val targets = BOX_UNITS[b].filter {
                    it !in line && board.isEmpty(it) && v in board.candidates[it]
                }
                if (targets.isNotEmpty()) {
                    return Step(
                        technique = "locked-candidates",
                        focusCells = spots,
                        eliminations = targets.map { Elimination(it, listOf(v)) },
                        explanation = "In ${unitLabel(u)}, $v is confined to box ${b + 1}, so $v " +
                            "can be removed from ${targets.joinToString(", ") { cellLabel(it) }}.",
                        depth = 2,
                    )
                }
            }
        }
        return null
    }

    /**
     * Depth 3: naked pair. Two cells in a unit sharing the same two candidates lock those
     * digits to themselves, so both can be removed from the rest of the unit.
     */
    private fun nakedPair(board: Board): Step? {
        for (u in UNITS.indices) {
            val unit = UNITS[u]
            val pairs = unit.filter { board.isEmpty(it) && board.candidates[it].size == 2 }
            for (i in pairs.indices) {
                for (j in i + 1 until pairs.size) {
                    val a = board.candidates[pairs[i]]
                    val bcand = board.candidates[pairs[j]]
                    if (a[0] != bcand[0] || a[1] != bcand[1]) continue // same two digits (sorted)
                    val d1 = a[0]
                    val d2 = a[1]
                    val targets = unit.filter {
                        it != pairs[i] && it != pairs[j] && board.isEmpty(it) &&
                            (d1 in board.candidates[it] || d2 in board.candidates[it])
                    }
                    if (targets.isNotEmpty()) {
                        val unitWord = unitLabel(u).split(" ")[0]
                        return Step(
                            technique = "naked-pair",
                            focusCells = listOf(pairs[i], pairs[j]),
                            eliminations = targets.map { cell ->
                                Elimination(cell, listOf(d1, d2).filter { it in board.candidates[cell] })
                            },
                            explanation = "${cellLabel(pairs[i])} and ${cellLabel(pairs[j])} in " +
                                "${unitLabel(u)} can only be $d1 or $d2, so those digits can be " +
                                "removed from the rest of the $unitWord.",
                            depth = 3,
                        )
                    }
                }
            }
        }
        return null
    }

    /** The v1 ladder, ordered easiest-first by depth. */
    private val LADDER: List<(Board) -> Step?> =
        listOf(::nakedSingle, ::hiddenSingle, ::lockedCandidates, ::nakedPair)

    /**
     * Return the shallowest pedagogical hint for the player's current board, or null when
     * no known technique fires (caller falls back to a solution-backed reveal — "give up").
     * [userValues] are the player's committed entries keyed "col,row"; pencil-mark ("n:")
     * keys are ignored by [Board.build].
     */
    fun nextHint(puzzle: Puzzle, userValues: Map<String, Int>): Step? {
        val board = Board.build(SudokuEngine.parseHints(puzzle), userValues)
        for (technique in LADDER) {
            val step = technique(board)
            if (step != null) return step
        }
        return null
    }
}
