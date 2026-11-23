package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs

/**
 * The Mannequin Gate 2 rules shared by play and authoring, a port of
 * frontend/src/components/mannequinGate2Rules.ts. Pure, so it's unit-testable.
 *
 * Gray lines run through cell centres; each lists every cell it passes through as
 * (row, col), consecutive cells being 8-neighbours. Shade cells so every line passes
 * through exactly two shaded cells, two crossing lines (sharing a cell, or diagonal steps
 * crossing at a grid corner) have different gate sizes (cells between the two shaded
 * ones), and all unshaded cells are orthogonally connected.
 *
 * States: [ShadeCycle] values (0 empty, 1 shaded, 2 marked), indexed [row][col].
 */
object MannequinGate2Rules {

    data class Board(val rows: Int, val cols: Int, val lines: List<List<Pair<Int, Int>>>)

    /** Parse `{ rows, cols, lines }`; malformed cells are dropped. */
    fun parseBoard(canon: JsonObject): Board {
        val rows = (canon["rows"] as? JsonPrimitive)?.intOrNull ?: 0
        val cols = (canon["cols"] as? JsonPrimitive)?.intOrNull ?: 0
        val lines = (canon["lines"] as? JsonArray)?.map { line ->
            (line as? JsonArray)?.mapNotNull { cell ->
                val rc = (cell as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull }
                if (rc != null && rc.size == 2) rc[0] to rc[1] else null
            } ?: emptyList()
        } ?: emptyList()
        return Board(rows, cols, lines)
    }

    fun toCanon(board: Board): JsonObject = JsonObject(
        mapOf(
            "rows" to JsonPrimitive(board.rows),
            "cols" to JsonPrimitive(board.cols),
            "lines" to JsonArray(board.lines.map { line ->
                JsonArray(line.map { (r, c) -> JsonArray(listOf(JsonPrimitive(r), JsonPrimitive(c))) })
            }),
        ),
    )

    private fun at(r: Int, c: Int) = "R${r + 1}C${c + 1}"

    /** Blocking format problems, the same ones the web editor and the API reject. */
    fun formatProblems(board: Board): List<String> = buildList {
        val steps = HashMap<Set<Pair<Int, Int>>, Int>()
        board.lines.forEachIndexed { i, line ->
            val name = "Line ${i + 1}"
            if (line.size < 2) {
                add("$name has fewer than 2 cells")
                return@forEachIndexed
            }
            val seen = HashSet<Pair<Int, Int>>()
            line.forEachIndexed { k, (r, c) ->
                if (r !in 0 until board.rows || c !in 0 until board.cols) add("$name: ${at(r, c)} is off the board")
                if (!seen.add(r to c)) add("$name visits ${at(r, c)} twice")
                if (k > 0) {
                    val (pr, pc) = line[k - 1]
                    if (maxOf(abs(r - pr), abs(c - pc)) != 1) {
                        add("$name: ${at(pr, pc)} and ${at(r, c)} aren't neighbours")
                    } else {
                        val step = setOf(pr to pc, r to c)
                        val other = steps[step]
                        if (other != null && other != i) add("Lines ${other + 1} and ${i + 1} share the step ${at(pr, pc)}–${at(r, c)}")
                        steps[step] = i
                    }
                }
            }
        }
    }

    /** Pairs (i, j), i < j, of lines that cross: a shared cell, or diagonal steps crossing at a corner. */
    fun crossingPairs(lines: List<List<Pair<Int, Int>>>): List<Pair<Int, Int>> {
        val cellSets = lines.map { it.toSet() }
        // Each diagonal step as (corner row, corner col, slope sign).
        val corners = lines.map { l ->
            (1 until l.size).mapNotNull { k ->
                val (r1, c1) = l[k - 1]
                val (r2, c2) = l[k]
                if (abs(r1 - r2) != 1 || abs(c1 - c2) != 1) null
                else Triple(maxOf(r1, r2), maxOf(c1, c2), (r2 - r1) * (c2 - c1))
            }.toSet()
        }
        val pairs = mutableListOf<Pair<Int, Int>>()
        for (i in lines.indices) {
            for (j in i + 1 until lines.size) {
                val cross = cellSets[i].any { it in cellSets[j] } ||
                    corners[i].any { (r, c, s) -> Triple(r, c, -s) in corners[j] }
                if (cross) pairs += i to j
            }
        }
        return pairs
    }

    private fun state(states: List<List<Int>>, r: Int, c: Int): Int = states.getOrNull(r)?.getOrNull(c) ?: ShadeCycle.EMPTY

    fun shadedCount(line: List<Pair<Int, Int>>, states: List<List<Int>>): Int =
        line.count { (r, c) -> state(states, r, c) == ShadeCycle.SHADED }

    /** Cells between the line's two shaded cells; null unless exactly two are shaded. */
    fun gateSize(line: List<Pair<Int, Int>>, states: List<List<Int>>): Int? {
        val idx = line.indices.filter { k -> state(states, line[k].first, line[k].second) == ShadeCycle.SHADED }
        return if (idx.size == 2) idx[1] - idx[0] - 1 else null
    }

    fun linesWithTwo(board: Board, states: List<List<Int>>): Int = board.lines.count { shadedCount(it, states) == 2 }

    /**
     * Lines that already break a rule (Errors on): 3+ shaded; every cell decided with fewer
     * than 2 shaded; or exactly 2 shaded with the same gate as a crossing line with 2.
     */
    fun badLines(board: Board, states: List<List<Int>>): Set<Int> {
        val bad = HashSet<Int>()
        val gates = board.lines.map { gateSize(it, states) }
        board.lines.forEachIndexed { i, l ->
            val n = shadedCount(l, states)
            if (n > 2) bad += i
            if (n < 2 && l.all { (r, c) -> state(states, r, c) != ShadeCycle.EMPTY }) bad += i
        }
        for ((i, j) in crossingPairs(board.lines)) {
            if (gates[i] != null && gates[i] == gates[j]) {
                bad += i
                bad += j
            }
        }
        return bad
    }

    /** True when the unshaded cells form one non-empty orthogonally connected group. */
    fun whitesConnected(rows: Int, cols: Int, states: List<List<Int>>): Boolean {
        val whites = (0 until rows).flatMap { r -> (0 until cols).map { c -> r to c } }
            .filter { (r, c) -> state(states, r, c) != ShadeCycle.SHADED }
        if (whites.isEmpty()) return false
        val seen = hashSetOf(whites[0])
        val stack = ArrayDeque(listOf(whites[0]))
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            for ((dr, dc) in listOf(1 to 0, -1 to 0, 0 to 1, 0 to -1)) {
                val n = r + dr to c + dc
                if (n.first !in 0 until rows || n.second !in 0 until cols) continue
                if (state(states, n.first, n.second) == ShadeCycle.SHADED) continue
                if (seen.add(n)) stack.addLast(n)
            }
        }
        return seen.size == whites.size
    }

    fun isSolved(board: Board, states: List<List<Int>>): Boolean {
        if (board.lines.isEmpty()) return false
        if (board.lines.any { shadedCount(it, states) != 2 }) return false
        val gates = board.lines.map { gateSize(it, states) }
        if (crossingPairs(board.lines).any { (i, j) -> gates[i] == gates[j] }) return false
        return whitesConnected(board.rows, board.cols, states)
    }
}

/**
 * Mannequin Gate 2 (puzzle type 43). Ports frontend/src/extractors/mannequinGate2.ts,
 * progress/mannequinGate2.ts and the completion check. Input is the shared shade/mark tap
 * cycle; userValues are "c:col,row" -> 1 (shaded) / 2 (marked), as on the web.
 * Answer: `{ shaded: number[][] }` (marks aren't saved).
 */
object MannequinGate2Engine : ShadeMarkEngine {
    override val puzzleType: Int = 43

    override fun cellKey(col: Int, row: Int): String = "c:$col,$row"

    fun parseBoard(puzzle: Puzzle): MannequinGate2Rules.Board = MannequinGate2Rules.parseBoard(puzzle.canonRepr)

    fun states(board: MannequinGate2Rules.Board, userValues: Map<String, Int>): List<List<Int>> =
        List(board.rows) { r ->
            List(board.cols) { c ->
                when (val v = userValues[cellKey(c, r)]) {
                    ShadeCycle.SHADED, ShadeCycle.MARKED -> v
                    else -> ShadeCycle.EMPTY
                }
            }
        }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val s = states(board, userValues)
        return JsonObject(mapOf("shaded" to JsonArray(s.map { row ->
            JsonArray(row.map { JsonPrimitive(if (it == ShadeCycle.SHADED) 1 else 0) })
        })))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> = buildMap {
        (answer["shaded"] as? JsonArray)?.forEachIndexed { r, row ->
            (row as? JsonArray)?.forEachIndexed { c, v ->
                if ((v as? JsonPrimitive)?.intOrNull == 1) put(cellKey(c, r), ShadeCycle.SHADED)
            }
        }
    }

    /** Lines holding exactly two shaded cells / all lines * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        if (board.lines.isEmpty()) return 0.0
        val done = MannequinGate2Rules.linesWithTwo(board, states(board, userValues))
        return (done.toDouble() / board.lines.size * 100.0).coerceAtMost(100.0)
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return MannequinGate2Rules.isSolved(board, states(board, userValues))
    }
}
