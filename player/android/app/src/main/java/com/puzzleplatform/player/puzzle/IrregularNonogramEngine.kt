package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Irregular Nonogram (変形ロジック, puzzle type 45). Ports:
 *  - answer extraction from frontend/src/extractors/irregularNonogram.ts
 *  - progress from frontend/src/progress/irregularNonogram.ts
 *  - segments, clue layout, format problems, line fit and completion from
 *    frontend/src/components/irregularNonogramRules.ts
 *
 * canonRepr: { width, height, cells, rowClues: [{row, start, side, clues}],
 *   colClues: [{col, start, side, clues}] } — a mask of board cells; each segment
 *   (maximal run of board cells along a row or column, named by its first cell) has at
 *   most one clue, printed at its "start" (left / above) or "end" (right / below).
 *
 * answer: { cells } — height x width, 1 = filled. User values are Nonogram's: "col,row" ->
 * 1 filled / 2 crossed.
 */
object IrregularNonogramEngine : PuzzleEngine {
    override val puzzleType: Int = 45

    const val UNSET = 0
    const val FILLED = 1
    const val CROSSED = 2

    data class Clue(val axis: String, val line: Int, val start: Int, val side: String, val clues: List<Int>)

    data class Board(
        val rows: Int,
        val cols: Int,
        // rows x cols; true = board cell
        val cells: List<List<Boolean>>,
        val clues: List<Clue>,
    ) {
        fun isBoard(r: Int, c: Int): Boolean = r in 0 until rows && c in 0 until cols && cells[r][c]
    }

    /** A maximal run of board cells along a row ("row") or column ("col"). */
    data class Segment(val axis: String, val line: Int, val start: Int, val length: Int) {
        val key: String get() = "$axis:$line:$start"

        /** Cells (row, col) of the segment, in reading order. */
        fun cells(): List<Pair<Int, Int>> =
            (0 until length).map { i -> if (axis == "row") line to start + i else start + i to line }
    }

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        val cols = ((canon["width"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val rows = ((canon["height"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val arr = canon["cells"] as? JsonArray
        val cells = List(rows) { r ->
            val row = arr?.getOrNull(r) as? JsonArray
            List(cols) { c -> (row?.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1 }
        }
        fun clues(key: String, axis: String, lineKey: String): List<Clue> =
            (canon[key] as? JsonArray)?.mapNotNull { el ->
                val o = el as? JsonObject ?: return@mapNotNull null
                val line = (o[lineKey] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
                val start = (o["start"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
                val side = (o["side"] as? JsonPrimitive)?.contentOrNull?.takeIf { it == "start" || it == "end" } ?: "start"
                val nums = (o["clues"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()
                Clue(axis, line, start, side, nums)
            } ?: emptyList()
        return Board(rows, cols, cells, clues("rowClues", "row", "row") + clues("colClues", "col", "col"))
    }

    fun segments(board: Board): List<Segment> {
        val out = mutableListOf<Segment>()
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            if (!board.isBoard(r, c) || board.isBoard(r, c - 1)) continue
            var n = 0
            while (board.isBoard(r, c + n)) n++
            out += Segment("row", r, c, n)
        }
        for (c in 0 until board.cols) for (r in 0 until board.rows) {
            if (!board.isBoard(r, c) || board.isBoard(r - 1, c)) continue
            var n = 0
            while (board.isBoard(r + n, c)) n++
            out += Segment("col", c, r, n)
        }
        return out
    }

    /** The segment holding (r, c) along an axis, or null off the board. */
    fun segmentAt(board: Board, axis: String, r: Int, c: Int): Segment? {
        if (!board.isBoard(r, c)) return null
        return if (axis == "row") {
            var s = c
            while (board.isBoard(r, s - 1)) s--
            var e = c
            while (board.isBoard(r, e + 1)) e++
            Segment(axis, r, s, e - s + 1)
        } else {
            var s = r
            while (board.isBoard(s - 1, c)) s--
            var e = r
            while (board.isBoard(e + 1, c)) e++
            Segment(axis, c, s, e - s + 1)
        }
    }

    fun clueKey(clue: Clue) = "${clue.axis}:${clue.line}:${clue.start}"

    /** Clues by segment key (the first wins when a segment has two). */
    fun cluesBySegment(board: Board): Map<String, Clue> {
        val out = LinkedHashMap<String, Clue>()
        for (clue in board.clues) out.putIfAbsent(clueKey(clue), clue)
        return out
    }

    /** Where each number of a clue is drawn, in reading order: Triple(row, col, value). */
    fun clueLayout(clue: Clue, length: Int): List<Triple<Int, Int, Int>> {
        val k = clue.clues.size
        val positions = List(k) { i -> if (clue.side == "start") clue.start - 1 - i else clue.start + length + i }
        val ordered = if (clue.side == "start") positions.reversed() else positions
        return ordered.mapIndexed { i, p ->
            val (r, c) = if (clue.axis == "row") clue.line to p else p to clue.line
            Triple(r, c, clue.clues[i])
        }
    }

    /** The drawing's lattice bounds (board + clue blocks): minRow, minCol, maxRow, maxCol. */
    fun layoutBounds(board: Board): IntArray {
        val b = intArrayOf(0, 0, board.rows - 1, board.cols - 1)
        val segs = segments(board).associateBy { it.key }
        for (clue in board.clues) {
            val seg = segs[clueKey(clue)] ?: continue
            for ((r, c, _) in clueLayout(clue, seg.length)) {
                b[0] = minOf(b[0], r); b[1] = minOf(b[1], c); b[2] = maxOf(b[2], r); b[3] = maxOf(b[3], c)
            }
        }
        return b
    }

    /** Format problems (port of irregularNonogramFormatProblems): message and cells (row, col). */
    fun formatProblems(board: Board): List<Pair<String, List<Pair<Int, Int>>>> {
        if (board.cells.size != board.rows || board.cells.any { it.size != board.cols }) {
            return listOf("cells must be ${board.rows} x ${board.cols}" to emptyList())
        }
        val out = mutableListOf<Pair<String, List<Pair<Int, Int>>>>()
        val segs = segments(board).associateBy { it.key }
        if (segs.isEmpty()) out += "The board has no cells" to emptyList()
        val seen = mutableSetOf<String>()
        val taken = mutableMapOf<Pair<Int, Int>, String>()
        for (r in 0 until board.rows) for (c in 0 until board.cols) if (board.cells[r][c]) taken[r to c] = "the board"
        fun at(r: Int, c: Int) = "R${r + 1}C${c + 1}"
        for (clue in board.clues) {
            val name = if (clue.axis == "row") "Row ${clue.line + 1} clue at ${at(clue.line, clue.start)}"
            else "Column ${clue.line + 1} clue at ${at(clue.start, clue.line)}"
            val key = clueKey(clue)
            val seg = segs[key]
            val first = if (clue.axis == "row") clue.line to clue.start else clue.start to clue.line
            if (seg == null) {
                val piece = if (clue.axis == "row") "row" else "column"
                out += "$name doesn't start a $piece piece of the board" to
                    (if (board.isBoard(first.first, first.second)) listOf(first) else emptyList())
                continue
            }
            if (!seen.add(key)) {
                out += "$name: the piece has two clues" to seg.cells()
                continue
            }
            val need = clue.clues.sum() + clue.clues.size - 1
            if (need > seg.length) {
                out += "$name (${clue.clues.joinToString(" ")}) doesn't fit its ${seg.length} cells" to seg.cells()
            }
            val block = clueLayout(clue, seg.length).map { (r, c, _) -> r to c }
            block.firstOrNull { it in taken }?.let { (r, c) ->
                out += "$name overlaps ${taken[r to c]} at ${at(r, c)}" to
                    (if (board.isBoard(r, c)) listOf(r to c) else emptyList())
            }
            for (cell in block) taken.putIfAbsent(cell, name.lowercase())
        }
        return out
    }

    /** Misread warnings (overridable): pieces with no clue. */
    fun warnings(board: Board): List<Pair<String, List<Pair<Int, Int>>>> {
        val clued = cluesBySegment(board)
        val missing = segments(board).filter { it.key !in clued }
        if (missing.isEmpty()) return emptyList()
        val noun = if (missing.size == 1) "piece has" else "pieces have"
        return listOf("${missing.size} $noun no clue" to missing.map { it.cells().first() })
    }

    // ---- Lines ------------------------------------------------------------------------

    fun runs(filled: List<Boolean>): List<Int> {
        val out = mutableListOf<Int>()
        var n = 0
        for (f in filled) {
            if (f) n++ else if (n > 0) { out += n; n = 0 }
        }
        if (n > 0) out += n
        return out
    }

    /** Whether a line's decided cells (1 filled, 2 crossed, 0 open) still fit its clue. */
    fun lineFits(states: List<Int>, clues: List<Int>): Boolean {
        val n = states.size
        val k = clues.size
        val ok = Array(k + 1) { BooleanArray(n + 2) }
        ok[k][n] = true
        for (i in n - 1 downTo 0) ok[k][i] = states[i] != FILLED && ok[k][i + 1]
        ok[k][n + 1] = true
        for (j in k - 1 downTo 0) {
            val len = clues[j]
            for (i in n downTo 0) {
                var v = i < n && states[i] != FILLED && ok[j][i + 1]
                if (!v && i + len <= n && (i until i + len).none { states[it] == CROSSED }) {
                    v = if (i + len == n) j == k - 1 else states[i + len] != FILLED && ok[j + 1][i + len + 1]
                }
                ok[j][i] = v
            }
        }
        return ok[0][0]
    }

    fun state(values: Map<String, Int>, r: Int, c: Int): Int =
        when (val v = values["$c,$r"]) { FILLED, CROSSED -> v; else -> UNSET }

    /** Segment keys whose filled cells match their clue, and those whose marks can't fit. */
    fun clueStatus(board: Board, values: Map<String, Int>): Pair<Set<String>, Set<String>> {
        val satisfied = mutableSetOf<String>()
        val broken = mutableSetOf<String>()
        val clued = cluesBySegment(board)
        for (s in segments(board)) {
            val clue = clued[s.key] ?: continue
            val states = s.cells().map { (r, c) -> state(values, r, c) }
            if (runs(states.map { it == FILLED }) == clue.clues) satisfied += s.key
            if (!lineFits(states, clue.clues)) broken += s.key
        }
        return satisfied to broken
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        val clued = cluesBySegment(board)
        if (clued.isEmpty()) return false
        return segments(board).all { s ->
            val clue = clued[s.key] ?: return@all true
            runs(s.cells().map { (r, c) -> state(userValues, r, c) == FILLED }) == clue.clues
        }
    }

    /** Board cells filled or crossed / board cells * 100 (Nonogram's metric). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        var total = 0
        var decided = 0
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            if (!board.cells[r][c]) continue
            total++
            if (state(userValues, r, c) != UNSET) decided++
        }
        return if (total == 0) 0.0 else (decided.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val cells = JsonArray(List(board.rows) { r ->
            JsonArray(List(board.cols) { c ->
                JsonPrimitive(if (board.cells[r][c] && state(userValues, r, c) == FILLED) 1 else 0)
            })
        })
        return JsonObject(mapOf("cells" to cells))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = answer["cells"] as? JsonArray ?: return emptyMap()
        val out = mutableMapOf<String, Int>()
        cells.forEachIndexed { r, rowEl ->
            (rowEl as? JsonArray)?.forEachIndexed { c, v ->
                if ((v as? JsonPrimitive)?.intOrNull == 1) out["$c,$r"] = FILLED
            }
        }
        return out
    }

    /** Opaque black for a filled cell; white for the rest of the board; grey off it. */
    const val FILL_ARGB: Int = 0xFF000000.toInt()
    const val PAPER_ARGB: Int = 0xFFFFFFFF.toInt()
    const val GROUND_ARGB: Int = 0xFFD9D9D9.toInt()

    /** Row-major packed-ARGB picture: filled cells black, other board cells [boardArgb], off-board ground. */
    fun pictureCells(board: Board, values: Map<String, Int>, boardArgb: Int): IntArray =
        IntArray(board.rows * board.cols) { i ->
            val r = i / board.cols
            val c = i % board.cols
            when {
                !board.cells[r][c] -> GROUND_ARGB
                state(values, r, c) == FILLED -> FILL_ARGB
                else -> boardArgb
            }
        }

    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return null
        return PuzzleThumbnail(board.cols, board.rows, pictureCells(board, restoreUserValues(puzzle, answer), PAPER_ARGB))
    }
}
