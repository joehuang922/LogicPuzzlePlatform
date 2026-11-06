package com.puzzleplatform.player.puzzle

/**
 * Offline hint ladder for the sudoku family (plain sudoku, combo sudoku): the Kotlin port
 * of player/solver/src/plugins/sudoku (units.ts + techniques.ts) and hint.ts. It reads
 * cells, units and peers from a [Geometry], so [SudokuHinter] (one 9x9) and
 * [ComboSudokuHinter] (overlapping 9x9 boards) share every rung. Runs on-device, no
 * network; units are scanned in geometry order, matching the TS engine step for step.
 */
object UnitHinter {

    enum class Kind(val noun: String) { ROW("row"), COL("column"), BOX("box") }

    /**
     * Cells 0 until [size]; [units] (each 9 cell ids) in scan order with their [kinds];
     * [key] maps a cell to the client's "col,row", [cellLabel]/[unitLabel] name them.
     */
    class Geometry(
        val size: Int,
        val units: List<IntArray>,
        val kinds: List<Kind>,
        val key: (Int) -> String,
        val cellLabel: (Int) -> String,
        val unitLabel: (Int) -> String,
    ) {
        /** Per cell, the indices of the units containing it, ascending. */
        val cellUnits: Array<IntArray>

        /** Per cell, every other cell sharing a unit with it. */
        val peers: Array<IntArray>

        init {
            val cu = Array(size) { mutableListOf<Int>() }
            val ps = Array(size) { linkedSetOf<Int>() }
            units.forEachIndexed { u, unit ->
                for (id in unit) {
                    cu[id].add(u)
                    for (other in unit) if (other != id) ps[id].add(other)
                }
            }
            cellUnits = Array(size) { cu[it].toIntArray() }
            peers = Array(size) { ps[it].toIntArray() }
        }
    }

    /** A candidate elimination a technique justifies (no placement yet). */
    data class Elimination(val cell: Int, val digits: List<Int>)

    /** A forced placement a technique determines. */
    data class Placement(val cell: Int, val value: Int)

    /** One hint step, mirroring the TS `Step`. Cell ids index the board's [Geometry]. */
    data class Step(
        val technique: String,
        val focusCells: List<Int>,
        val eliminations: List<Elimination> = emptyList(),
        val placement: Placement? = null,
        val explanation: String,
        val depth: Int,
    )

    /**
     * A read-only candidate board: each cell's digit (0 = empty) and, per empty cell, the
     * digits its peers leave legal. Reasons from committed digits only; pencil marks are
     * ignored.
     */
    class Board(val geo: Geometry, val values: IntArray, val candidates: Array<IntArray>) {
        fun isEmpty(id: Int): Boolean = values[id] == 0

        /** A copy with [eliminations] struck from the candidates (values unchanged). */
        fun withEliminations(eliminations: List<Elimination>): Board {
            val next = candidates.copyOf()
            for ((cell, digits) in eliminations) next[cell] = next[cell].filter { it !in digits }.toIntArray()
            return Board(geo, values, next)
        }

        companion object {
            fun build(geo: Geometry, values: IntArray): Board = Board(
                geo,
                values,
                Array(geo.size) { id ->
                    if (values[id] != 0) return@Array IntArray(0)
                    val taken = BooleanArray(10)
                    for (peer in geo.peers[id]) if (values[peer] != 0) taken[values[peer]] = true
                    (1..9).filter { !taken[it] }.toIntArray()
                },
            )
        }
    }

    // --- Technique ladder, easiest-first by depth. ---

    /** Depth 0: a cell with exactly one remaining candidate. */
    private fun nakedSingle(board: Board): Step? {
        val geo = board.geo
        for (id in 0 until geo.size) {
            if (board.isEmpty(id) && board.candidates[id].size == 1) {
                val value = board.candidates[id][0]
                return Step(
                    technique = "naked-single",
                    focusCells = listOf(id),
                    placement = Placement(id, value),
                    explanation = "${geo.cellLabel(id)} has only one possible digit left: $value.",
                    depth = 0,
                )
            }
        }
        return null
    }

    /** Depth 1: a digit that fits in exactly one cell of some unit. */
    private fun hiddenSingle(board: Board): Step? {
        val geo = board.geo
        for (u in geo.units.indices) {
            val unit = geo.units[u]
            for (v in 1..9) {
                val spots = unit.filter { board.isEmpty(it) && v in board.candidates[it] }
                if (spots.size == 1) {
                    // Skip if it's also a naked single (depth 0 would have caught it).
                    if (board.candidates[spots[0]].size == 1) continue
                    val id = spots[0]
                    return Step(
                        technique = "hidden-single",
                        focusCells = listOf(id),
                        placement = Placement(id, v),
                        explanation = "In ${geo.unitLabel(u)}, $v can only go in ${geo.cellLabel(id)}.",
                        depth = 1,
                    )
                }
            }
        }
        return null
    }

    /** Units passing [kind] that contain every cell of [cells], in unit order. */
    private fun unitsContaining(board: Board, cells: List<Int>, kind: (Kind) -> Boolean): List<Int> {
        val geo = board.geo
        return geo.cellUnits[cells[0]].filter { u -> kind(geo.kinds[u]) && cells.all { u in geo.cellUnits[it] } }
    }

    /**
     * Depth 2: locked candidates. Within a box, a digit whose spots share one line can be
     * removed from the rest of that line (pointing); within a line, a digit whose spots
     * share one box can be removed from the rest of that box (claiming). In a combo
     * sudoku a shared box meets the lines of every board covering it.
     */
    private fun lockedCandidates(board: Board): Step? {
        val geo = board.geo
        fun has(id: Int, v: Int) = board.isEmpty(id) && v in board.candidates[id]
        // Pointing: box -> line.
        for (b in geo.units.indices) {
            if (geo.kinds[b] != Kind.BOX) continue
            val box = geo.units[b]
            for (v in 1..9) {
                val spots = box.filter { has(it, v) }
                if (spots.size < 2) continue
                for (line in unitsContaining(board, spots) { it != Kind.BOX }) {
                    val targets = geo.units[line].filter { it !in box && has(it, v) }
                    if (targets.isEmpty()) continue
                    return Step(
                        technique = "locked-candidates",
                        focusCells = spots,
                        eliminations = targets.map { Elimination(it, listOf(v)) },
                        explanation = "In ${geo.unitLabel(b)}, $v is confined to ${geo.unitLabel(line)}, so $v can be " +
                            "removed from ${targets.joinToString(", ") { geo.cellLabel(it) }}.",
                        depth = 2,
                    )
                }
            }
        }
        // Claiming: line -> box.
        for (u in geo.units.indices) {
            if (geo.kinds[u] == Kind.BOX) continue
            val line = geo.units[u]
            for (v in 1..9) {
                val spots = line.filter { has(it, v) }
                if (spots.size < 2) continue
                val b = unitsContaining(board, spots) { it == Kind.BOX }.firstOrNull() ?: continue
                val targets = geo.units[b].filter { it !in line && has(it, v) }
                if (targets.isNotEmpty()) {
                    return Step(
                        technique = "locked-candidates",
                        focusCells = spots,
                        eliminations = targets.map { Elimination(it, listOf(v)) },
                        explanation = "In ${geo.unitLabel(u)}, $v is confined to ${geo.unitLabel(b)}, so $v " +
                            "can be removed from ${targets.joinToString(", ") { geo.cellLabel(it) }}.",
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
        val geo = board.geo
        for (u in geo.units.indices) {
            val unit = geo.units[u]
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
                        return Step(
                            technique = "naked-pair",
                            focusCells = listOf(pairs[i], pairs[j]),
                            eliminations = targets.map { cell ->
                                Elimination(cell, listOf(d1, d2).filter { it in board.candidates[cell] })
                            },
                            explanation = "${geo.cellLabel(pairs[i])} and ${geo.cellLabel(pairs[j])} in " +
                                "${geo.unitLabel(u)} can only be $d1 or $d2, so those digits can be " +
                                "removed from the rest of the ${geo.kinds[u].noun}.",
                            depth = 3,
                        )
                    }
                }
            }
        }
        return null
    }

    private fun isSingle(mask: Int): Boolean = mask != 0 && (mask and (mask - 1)) == 0

    /**
     * Fill in forced digits on bitmask domains until nothing changes: a solved cell's
     * digit leaves its peers (naked single), a digit with one place left in a unit goes
     * there (hidden single). Worklist-driven from [changed]. Mutates [dom]; false on a
     * contradiction.
     */
    private fun propagateSingles(geo: Geometry, dom: IntArray, changed: IntArray): Boolean {
        val queue = ArrayDeque<Int>()
        val dirty = BooleanArray(geo.units.size)
        val dirtyList = ArrayDeque<Int>()
        fun touched(id: Int) {
            queue.addLast(id)
            for (u in geo.cellUnits[id]) {
                if (!dirty[u]) {
                    dirty[u] = true
                    dirtyList.addLast(u)
                }
            }
        }
        for (id in changed) touched(id)
        while (true) {
            while (queue.isNotEmpty()) {
                val id = queue.removeLast()
                val m = dom[id]
                if (!isSingle(m)) continue
                for (p in geo.peers[id]) {
                    if (dom[p] and m != 0) {
                        dom[p] = dom[p] and m.inv()
                        if (dom[p] == 0) return false
                        touched(p)
                    }
                }
            }
            if (dirtyList.isEmpty()) return true
            val u = dirtyList.removeLast()
            dirty[u] = false
            for (v in 1..9) {
                val b = 1 shl v
                var place = -1
                var count = 0
                for (id in geo.units[u]) {
                    if (dom[id] and b != 0) {
                        place = id
                        if (++count > 1) break
                    }
                }
                if (count == 0) return false
                if (count == 1 && dom[place] != b) {
                    dom[place] = b
                    touched(place)
                }
            }
        }
    }

    /**
     * Depth 4: contradiction. A cell where every candidate but one, once assumed, runs
     * into a contradiction by filling in singles alone. The last rung, for when the
     * pattern techniques above run dry.
     */
    private fun contradiction(board: Board): Step? {
        val geo = board.geo
        val base = IntArray(geo.size) { id ->
            if (board.values[id] != 0) 1 shl board.values[id]
            else board.candidates[id].fold(0) { m, d -> m or (1 shl d) }
        }
        // Close the board under singles once; each trial then only spreads from its cell.
        if (!propagateSingles(geo, base, IntArray(geo.size) { it })) return null
        for (id in 0 until geo.size) {
            if (!board.isEmpty(id) || board.candidates[id].size < 2) continue
            val survivors = board.candidates[id].filter { v ->
                if (base[id] and (1 shl v) == 0) return@filter false // already ruled out by singles
                val dom = base.copyOf()
                dom[id] = 1 shl v
                propagateSingles(geo, dom, intArrayOf(id))
            }
            if (survivors.size != 1) continue
            val value = survivors[0]
            val others = board.candidates[id].filter { it != value }
            return Step(
                technique = "contradiction",
                focusCells = listOf(id),
                placement = Placement(id, value),
                explanation = "Putting ${others.joinToString(", ")} in ${geo.cellLabel(id)} leads to a contradiction, so it is $value.",
                depth = 4,
            )
        }
        return null
    }

    private val LADDER: List<(Board) -> Step?> =
        listOf(::nakedSingle, ::hiddenSingle, ::lockedCandidates, ::nakedPair, ::contradiction)

    /** The shallowest rung that fires on [board], or null. */
    fun nextHint(board: Board): Step? = LADDER.firstNotNullOfOrNull { it(board) }

    /**
     * The next *answer*, the port of the TS `nextPlacement`: a rung that only rules out
     * candidates is applied to a scratch copy of the candidates and the ladder runs
     * again, until a rung places a digit. A placement reached through eliminations comes
     * back as technique "next-answer" ("R4C5 is 7.", depth = deepest rung used); one found
     * directly is returned as [nextHint] gives it. Null when the ladder runs dry first.
     */
    fun nextPlacement(start: Board): Step? {
        var board = start
        var depth = 0
        var eliminated = false
        // Every elimination step strikes at least one candidate, so this ends; the cap
        // is a backstop against a technique reporting a no-op.
        repeat(1000) {
            val step = nextHint(board) ?: return null
            depth = maxOf(depth, step.depth)
            val placement = step.placement
            if (placement != null) {
                if (!eliminated) return step
                return Step(
                    technique = "next-answer",
                    focusCells = listOf(placement.cell),
                    placement = placement,
                    explanation = "${board.geo.cellLabel(placement.cell)} is ${placement.value}.",
                    depth = depth,
                )
            }
            if (step.eliminations.isEmpty()) return null
            board = board.withEliminations(step.eliminations)
            eliminated = true
        }
        return null
    }
}
