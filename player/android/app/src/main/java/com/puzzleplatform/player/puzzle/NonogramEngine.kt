package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Nonogram / Picross (puzzle type 6). Ports:
 *  - answer extraction from frontend/src/extractors/nonogram.ts
 *  - progress from frontend/src/progress/nonogram.ts
 *  - line analysis from frontend/src/liveValidators/nonogram.ts (analyzeLineStatus)
 *  - completion logic from frontend/src/components/NonogramBoard.tsx (validateSolution)
 *
 * canonRepr: { rowClues: number[][], colClues: number[][] }. rowClues[r] is the
 * run-length list for row r (top-to-bottom), colClues[c] for column c
 * (left-to-right). An empty line's clue is either [] or [0].
 *
 * answer: { cells: number[][] } — rows x cols; 0 = unset, 1 = filled, 2 = crossed.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state, matching
 * the web client's transport. Two divergences from the web port, both intentional:
 *  - Crosses (state 2) are PERSISTED here (the web extractor drops them to 0). A
 *    player's cross marks are a solving aid that should survive save/restore. This
 *    stays forward-compatible with web: its board reads the cells grid directly and
 *    its progress counts any non-zero state, so persisted 2s don't break it.
 *  - There are no pencil-mark notes.
 */
object NonogramEngine : PuzzleEngine {
    override val puzzleType: Int = 6

    const val UNSET = 0
    const val FILLED = 1
    const val CROSSED = 2

    /** Parsed clue lists. rowClues.size = rows, colClues.size = cols. */
    class Clues(val rowClues: List<List<Int>>, val colClues: List<List<Int>>) {
        val rows: Int get() = rowClues.size
        val cols: Int get() = colClues.size
    }

    /** Parse rowClues/colClues from a puzzle's canonRepr; missing/invalid -> empty. */
    fun parseClues(puzzle: Puzzle): Clues =
        Clues(parseClueList(puzzle.canonRepr["rowClues"]), parseClueList(puzzle.canonRepr["colClues"]))

    private fun parseClueList(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray ?: return emptyList()
        return outer.map { lineEl ->
            val arr = lineEl as? JsonArray ?: return@map emptyList<Int>()
            arr.mapNotNull { (it as? JsonPrimitive)?.intOrNull }
        }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val clues = parseClues(puzzle)
        val rows = buildList {
            for (r in 0 until clues.rows) {
                add(JsonArray(buildList {
                    for (c in 0 until clues.cols) {
                        // Persist filled (1) and crossed (2); everything else is 0.
                        val v = userValues["$c,$r"] ?: UNSET
                        add(JsonPrimitive(if (v == FILLED || v == CROSSED) v else UNSET))
                    }
                }))
            }
        }
        return JsonObject(mapOf("cells" to JsonArray(rows)))
    }

    /** Percent of grid cells that carry any mark (fill or cross), matching web progress. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val clues = parseClues(puzzle)
        val total = clues.rows * clues.cols
        if (total == 0) return 0.0
        var marked = 0
        for (r in 0 until clues.rows) {
            for (c in 0 until clues.cols) {
                if ((userValues["$c,$r"] ?: UNSET) != UNSET) marked++
            }
        }
        return marked.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val clues = parseClues(puzzle)
        val cells = answer["cells"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in 0 until clues.rows) {
            val rowArr = cells?.getOrNull(r) as? JsonArray
            for (c in 0 until clues.cols) {
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (v == FILLED || v == CROSSED) result["$c,$r"] = v
            }
        }
        return result
    }

    /** The filled/crossed/unset state of column [c], top to bottom. */
    private fun columnLine(userValues: Map<String, Int>, c: Int, rows: Int): List<Int> =
        List(rows) { r -> userValues["$c,$r"] ?: UNSET }

    /** The filled/crossed/unset state of row [r], left to right. */
    private fun rowLine(userValues: Map<String, Int>, r: Int, cols: Int): List<Int> =
        List(cols) { c -> userValues["$c,$r"] ?: UNSET }

    /** Run-lengths of consecutive FILLED cells in a line; empty line -> [0] (matches web). */
    private fun groups(line: List<Int>): List<Int> {
        val out = mutableListOf<Int>()
        var count = 0
        for (v in line) {
            if (v == FILLED) count++ else { if (count > 0) out.add(count); count = 0 }
        }
        if (count > 0) out.add(count)
        return if (out.isEmpty()) listOf(0) else out
    }

    /** Normalize a clue to its comparable run-length form: empty / [0] both mean "blank line". */
    private fun normalizeClue(clue: List<Int>): List<Int> =
        if (clue.isEmpty() || clue == listOf(0)) listOf(0) else clue

    // -- live-validation (port of analyzeLineStatus) ------------------------

    enum class ClueStatus { NORMAL, SATISFIED, ERROR }

    /** Per-clue status plus whether the line has a certain contradiction. */
    data class LineAnalysis(val perClue: List<ClueStatus>, val hasError: Boolean)

    private data class Group(
        val start: Int, val end: Int, val size: Int,
        val sealedLeft: Boolean, val sealedRight: Boolean,
    )

    /**
     * Heuristic partial-line checker (port of the web analyzeLineStatus): detects many
     * (not all) contradictions via sealed-group reasoning and marks individual clue
     * numbers satisfied/error. A group is "sealed" when it can't grow (both ends are a
     * crossed cell or an edge).
     */
    fun analyzeLineStatus(clueRaw: List<Int>, line: List<Int>): LineAnalysis {
        val clue = if (clueRaw.isEmpty()) listOf(0) else clueRaw
        val n = line.size
        val clueLen = clue.size

        val groups = mutableListOf<Group>()
        var i = 0
        while (i < n) {
            if (line[i] == FILLED) {
                val start = i
                while (i < n && line[i] == FILLED) i++
                val end = i
                val sealedLeft = start == 0 || line[start - 1] == CROSSED
                val sealedRight = end == n || line[end] == CROSSED
                groups.add(Group(start, end, end - start, sealedLeft, sealedRight))
            } else i++
        }

        val perClue = MutableList(clueLen) { ClueStatus.NORMAL }

        // Full satisfaction.
        if (groups.size == clueLen && groups.withIndex().all { (idx, g) -> g.size == clue[idx] }) {
            return LineAnalysis(List(clueLen) { ClueStatus.SATISFIED }, false)
        }

        val sealedGroups = groups.filter { it.sealedLeft && it.sealedRight }
        if (sealedGroups.size > clueLen) {
            return LineAnalysis(List(clueLen) { ClueStatus.ERROR }, true)
        }
        // Clue [0] means the line must be empty: any filled group is an error.
        if (clueLen == 1 && clue[0] == 0) {
            return if (groups.isNotEmpty()) LineAnalysis(listOf(ClueStatus.ERROR), true)
            else LineAnalysis(listOf(ClueStatus.SATISFIED), false)
        }

        val maxClue = clue.max()
        for (g in sealedGroups) {
            if (g.size > maxClue) return LineAnalysis(List(clueLen) { ClueStatus.ERROR }, true)
        }

        // Partial satisfaction from the start.
        var satisfiedFromStart = 0
        for (gi in groups.indices) {
            val g = groups[gi]
            if (!g.sealedLeft || !g.sealedRight) break
            if (satisfiedFromStart >= clueLen) break
            val gapStart = if (gi == 0) 0 else groups[gi - 1].end
            var hasUnsetInGap = false
            for (j in gapStart until g.start) if (line[j] == UNSET) { hasUnsetInGap = true; break }
            if (hasUnsetInGap) break
            if (g.size == clue[satisfiedFromStart]) satisfiedFromStart++
            else return LineAnalysis(List(clueLen) { ClueStatus.ERROR }, true)
        }

        // Partial satisfaction from the end.
        var satisfiedFromEnd = 0
        for (gi in groups.indices.reversed()) {
            val g = groups[gi]
            if (!g.sealedLeft || !g.sealedRight) break
            val clueIdx = clueLen - 1 - satisfiedFromEnd
            if (clueIdx < satisfiedFromStart) break
            val gapEnd = if (gi == groups.size - 1) n else groups[gi + 1].start
            var hasUnsetInGap = false
            for (j in g.end until gapEnd) if (line[j] == UNSET) { hasUnsetInGap = true; break }
            if (hasUnsetInGap) break
            if (g.size == clue[clueIdx]) satisfiedFromEnd++
            else return LineAnalysis(List(clueLen) { ClueStatus.ERROR }, true)
        }

        val remainingClues = clueLen - satisfiedFromStart - satisfiedFromEnd
        val startBound = if (satisfiedFromStart > 0) groups[satisfiedFromStart - 1].end else 0
        val endBound = if (satisfiedFromEnd > 0) groups[groups.size - satisfiedFromEnd].start else n
        val middleSealed = sealedGroups.count { it.start >= startBound && it.end <= endBound }
        if (middleSealed > remainingClues) {
            return LineAnalysis(List(clueLen) { ClueStatus.ERROR }, true)
        }

        for (ci in 0 until satisfiedFromStart) perClue[ci] = ClueStatus.SATISFIED
        for (ci in 0 until satisfiedFromEnd) perClue[clueLen - 1 - ci] = ClueStatus.SATISFIED
        return LineAnalysis(perClue, false)
    }

    /** Live-validation annotations. */
    data class Analysis(
        val cellErrors: Set<String>,     // "col,row" of a cell in an errored row or column
        val rowClueErrors: Set<String>,  // "r:i" -> row r's i-th clue number is in error
        val colClueErrors: Set<String>,  // "c:i" -> column c's i-th clue number is in error
    )

    fun analyze(puzzle: Puzzle, userValues: Map<String, Int>): Analysis {
        val clues = parseClues(puzzle)
        val rows = clues.rows
        val cols = clues.cols
        val rowAnalyses = List(rows) { r -> analyzeLineStatus(clues.rowClues[r], rowLine(userValues, r, cols)) }
        val colAnalyses = List(cols) { c -> analyzeLineStatus(clues.colClues[c], columnLine(userValues, c, rows)) }

        val cellErrors = mutableSetOf<String>()
        val rowClueErrors = mutableSetOf<String>()
        val colClueErrors = mutableSetOf<String>()

        for (r in 0 until rows) {
            rowAnalyses[r].perClue.forEachIndexed { i, s -> if (s == ClueStatus.ERROR) rowClueErrors.add("$r:$i") }
        }
        for (c in 0 until cols) {
            colAnalyses[c].perClue.forEachIndexed { i, s -> if (s == ClueStatus.ERROR) colClueErrors.add("$c:$i") }
        }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (rowAnalyses[r].hasError || colAnalyses[c].hasError) cellErrors.add("$c,$r")
            }
        }
        return Analysis(cellErrors, rowClueErrors, colClueErrors)
    }

    /** Per-clue satisfied/error status for a row, for grey/red hint coloring. */
    fun rowClueStatus(puzzle: Puzzle, userValues: Map<String, Int>, r: Int): List<ClueStatus> {
        val clues = parseClues(puzzle)
        return analyzeLineStatus(clues.rowClues.getOrElse(r) { emptyList() }, rowLine(userValues, r, clues.cols)).perClue
    }

    /** Per-clue satisfied/error status for a column. */
    fun colClueStatus(puzzle: Puzzle, userValues: Map<String, Int>, c: Int): List<ClueStatus> {
        val clues = parseClues(puzzle)
        return analyzeLineStatus(clues.colClues.getOrElse(c) { emptyList() }, columnLine(userValues, c, clues.rows)).perClue
    }

    /**
     * True when every row and column's filled runs match its clue exactly (port of
     * NonogramBoard.tsx validateSolution). Crosses are ignored; an all-unset board
     * with any non-blank clue is not complete. Requires at least one filled cell.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val clues = parseClues(puzzle)
        val rows = clues.rows
        val cols = clues.cols
        if (rows == 0 || cols == 0) return false
        var anyFilled = false
        for (r in 0 until rows) for (c in 0 until cols) if ((userValues["$c,$r"] ?: UNSET) == FILLED) { anyFilled = true }
        if (!anyFilled) return false

        for (r in 0 until rows) {
            if (groups(rowLine(userValues, r, cols)) != normalizeClue(clues.rowClues[r])) return false
        }
        for (c in 0 until cols) {
            if (groups(columnLine(userValues, c, rows)) != normalizeClue(clues.colClues[c])) return false
        }
        return true
    }

    /**
     * The solved answer grid IS the picture for a Nonogram: filled cells become opaque
     * black, everything else stays blank. Crosses are a solving aid, not part of the
     * picture, so they read as blank. Returns null when the grid is empty.
     */
    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val clues = parseClues(puzzle)
        val rows = clues.rows
        val cols = clues.cols
        if (rows == 0 || cols == 0) return null
        val values = restoreUserValues(puzzle, answer)
        val cells = IntArray(rows * cols) { i ->
            val c = i % cols
            val r = i / cols
            if (values["$c,$r"] == FILLED) THUMB_FILL_ARGB else 0
        }
        return PuzzleThumbnail(width = cols, height = rows, cells = cells)
    }
}

/** Opaque near-black for a filled nonogram cell, matching the board's FILL_COLOR. */
private const val THUMB_FILL_ARGB = 0xFF222222.toInt()
