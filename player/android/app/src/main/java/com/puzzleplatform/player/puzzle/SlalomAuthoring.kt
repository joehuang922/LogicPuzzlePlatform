package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** What one slalom cell holds while authoring: nothing, a wall, or part of a gate. */
enum class SlalomCell { EMPTY, WALL, GATE_H, GATE_V }

/**
 * The editable grid of a slalom being authored. Gates are drawn cell by cell, the way
 * the parser reads them: a gate is a maximal run of [SlalomCell.GATE_H] cells along a
 * row (or [SlalomCell.GATE_V] down a column), see [SlalomAuthoring.gates]. A gate's
 * order number rides on each of its cells in [numbers] ((row, col) -> order), so it
 * survives a run being split or extended. [start] is the circled cell as (row, col) and
 * [gateCount] the number written in it. Always rectangular.
 */
data class SlalomDraft(
    val cells: List<List<SlalomCell>> = emptyList(),
    val numbers: Map<Pair<Int, Int>, Int> = emptyMap(),
    val start: Pair<Int, Int>? = null,
    val gateCount: Int = 0,
) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): SlalomCell = cells.getOrNull(row)?.getOrNull(col) ?: SlalomCell.EMPTY
}

/**
 * One gate of a [SlalomDraft], in canon terms (see [SlalomEngine.Gate]): a vertical gate
 * runs down column [line] over rows [from]..[to]; a horizontal one along row [line] over
 * columns [from]..[to]. [numbers] are the distinct order numbers on its cells — more than
 * one is a format problem.
 */
data class SlalomDraftGate(
    val vertical: Boolean,
    val line: Int,
    val from: Int,
    val to: Int,
    val numbers: List<Int>,
) {
    /** The gate's cells as (row, col). */
    val cells: List<Pair<Int, Int>>
        get() = (from..to).map { if (vertical) it to line else line to it }

    /** 1-based "R2C3" or "R2C3–R2C5". */
    val label: String
        get() {
            val (r0, c0) = cells.first()
            val (r1, c1) = cells.last()
            val first = "R${r0 + 1}C${c0 + 1}"
            return if (from == to) first else "$first–R${r1 + 1}C${c1 + 1}"
        }
}

/**
 * Pure helpers for authoring a slalom question in the Admin screen, the analog of
 * frontend/src/components/SlalomEditor.tsx. The parser returns the canon directly; the
 * review step fixes mis-read walls, gates, gate numbers, the start circle and
 * phantom/missed lines.
 *
 * Slalom has no solver gate, so the server only checks the schema. [problems] catches
 * what can't be right on its face: no gates, no start or a start on a wall or gate, a
 * circled count that isn't the number of gates, a gate number past that count, and a
 * numbered gate with no wall at either end to show its number in. [formatProblems] is the
 * one thing the canon can't express — a gate carrying two different numbers (two
 * numbered runs drawn into one) — and blocks creation outright.
 *
 * Two gates that abut on the same line with no wall between read back as one gate; the
 * parser merges such dashed cells the same way, and real boards cap gates with walls.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object SlalomAuthoring {

    const val PUZZLE_TYPE = 10

    /** Read a parser canon into a draft, padding ragged rows; gate cells on walls or off the grid are dropped. */
    fun draftFromCanon(canon: JsonObject): SlalomDraft {
        val parsed = SlalomEngine.parse(previewPuzzle(SlalomDraft()).copy(canonRepr = canon))
        val rows = parsed.rows
        val cols = parsed.cols
        val cells = MutableList(rows) { r ->
            MutableList(cols) { c -> if (parsed.isWall(r, c)) SlalomCell.WALL else SlalomCell.EMPTY }
        }
        val numbers = mutableMapOf<Pair<Int, Int>, Int>()
        for (gate in parsed.gates) {
            for (i in gate.from..gate.to) {
                val (r, c) = if (gate.vertical) i to gate.line else gate.line to i
                if (r !in 0 until rows || c !in 0 until cols || cells[r][c] == SlalomCell.WALL) continue
                cells[r][c] = if (gate.vertical) SlalomCell.GATE_V else SlalomCell.GATE_H
                if (gate.number != null) numbers[r to c] = gate.number else numbers.remove(r to c)
            }
        }
        val hasStart = canon["start"] is JsonObject
        return SlalomDraft(
            cells = cells,
            numbers = numbers,
            start = if (hasStart) parsed.startRow to parsed.startCol else null,
            gateCount = parsed.gateCount,
        )
    }

    /** The canon to POST. A missing start is sent as R1C1 ([problems] flags it first). */
    fun canonFromDraft(draft: SlalomDraft): JsonObject {
        val (startRow, startCol) = draft.start ?: (0 to 0)
        return JsonObject(
            mapOf(
                "cells" to JsonArray(draft.cells.map { row ->
                    JsonArray(row.map { JsonPrimitive(if (it == SlalomCell.WALL) 1 else 0) })
                }),
                "start" to JsonObject(mapOf("row" to JsonPrimitive(startRow), "col" to JsonPrimitive(startCol))),
                "gateCount" to JsonPrimitive(draft.gateCount),
                "gates" to JsonArray(gates(draft).map { g ->
                    JsonObject(
                        mapOf(
                            "orientation" to JsonPrimitive(if (g.vertical) "v" else "h"),
                            "line" to JsonPrimitive(g.line),
                            "from" to JsonPrimitive(g.from),
                            "to" to JsonPrimitive(g.to),
                            "number" to (g.numbers.firstOrNull()?.let { JsonPrimitive(it) } ?: JsonNull),
                        )
                    )
                }),
            )
        )
    }

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: SlalomDraft): Puzzle = Puzzle(
        id = "admin-slalom-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "slalom",
        puzzleTypeJpLabel = "スラローム",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Every gate, horizontal runs first (in reading order), then vertical runs (column by column). */
    fun gates(draft: SlalomDraft): List<SlalomDraftGate> = buildList {
        for (r in 0 until draft.rows) {
            var c = 0
            while (c < draft.cols) {
                if (draft.cells[r][c] != SlalomCell.GATE_H) { c++; continue }
                val from = c
                while (c + 1 < draft.cols && draft.cells[r][c + 1] == SlalomCell.GATE_H) c++
                add(gate(draft, vertical = false, line = r, from = from, to = c))
                c++
            }
        }
        for (c in 0 until draft.cols) {
            var r = 0
            while (r < draft.rows) {
                if (draft.cells[r][c] != SlalomCell.GATE_V) { r++; continue }
                val from = r
                while (r + 1 < draft.rows && draft.cells[r + 1][c] == SlalomCell.GATE_V) r++
                add(gate(draft, vertical = true, line = c, from = from, to = r))
                r++
            }
        }
    }

    /** The gate (col, row) is part of, or null when it isn't a gate cell. */
    fun gateAt(draft: SlalomDraft, col: Int, row: Int): SlalomDraftGate? =
        gates(draft).firstOrNull { (row to col) in it.cells }

    /** Make (col, row) empty, a wall, or a gate cell. A cell that stops being a gate loses its number. */
    fun setCell(draft: SlalomDraft, col: Int, row: Int, kind: SlalomCell): SlalomDraft {
        if (!draft.inGrid(col, row)) return draft
        val isGate = kind == SlalomCell.GATE_H || kind == SlalomCell.GATE_V
        return draft.copy(
            cells = draft.cells.mapIndexed { r, line ->
                if (r != row) line else line.mapIndexed { c, old -> if (c == col) kind else old }
            },
            numbers = if (isGate) draft.numbers else draft.numbers - (row to col),
        )
    }

    /** Set (or with null, clear) the order number of the whole gate (col, row) is part of. No-op off a gate. */
    fun setGateNumber(draft: SlalomDraft, col: Int, row: Int, number: Int?): SlalomDraft {
        val gate = gateAt(draft, col, row) ?: return draft
        if (number != null && number < 1) return draft
        val rest = draft.numbers - gate.cells.toSet()
        return draft.copy(numbers = if (number == null) rest else rest + gate.cells.associateWith { number })
    }

    /** Put the start circle on (col, row). */
    fun setStart(draft: SlalomDraft, col: Int, row: Int): SlalomDraft =
        if (!draft.inGrid(col, row)) draft else draft.copy(start = row to col)

    /** Set the circled gate count. Negative counts are no-ops. */
    fun setGateCount(draft: SlalomDraft, count: Int): SlalomDraft =
        if (count < 0) draft else draft.copy(gateCount = count)

    /** Parse a typed number: digits only; blank -> null. */
    fun parseNum(text: String): Int? = text.filter { it.isDigit() }.take(2).toIntOrNull()

    /** Append an empty row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: SlalomDraft): SlalomDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { SlalomCell.EMPTY }))

    /** Append an empty column at the right. */
    fun addCol(draft: SlalomDraft): SlalomDraft =
        draft.copy(cells = draft.cells.map { it + SlalomCell.EMPTY })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row; a start on it is lost. */
    fun removeRow(draft: SlalomDraft, row: Int): SlalomDraft {
        if (draft.rows <= 1 || row !in 0 until draft.rows) return draft
        fun shift(at: Pair<Int, Int>): Pair<Int, Int>? = when {
            at.first == row -> null
            at.first > row -> at.first - 1 to at.second
            else -> at
        }
        return draft.copy(
            cells = draft.cells.filterIndexed { i, _ -> i != row },
            numbers = draft.numbers.mapNotNull { (at, n) -> shift(at)?.let { it to n } }.toMap(),
            start = draft.start?.let(::shift),
        )
    }

    /** Drop column [col]. Keeps at least one column; a start on it is lost. */
    fun removeCol(draft: SlalomDraft, col: Int): SlalomDraft {
        if (draft.cols <= 1 || col !in 0 until draft.cols) return draft
        fun shift(at: Pair<Int, Int>): Pair<Int, Int>? = when {
            at.second == col -> null
            at.second > col -> at.first to at.second - 1
            else -> at
        }
        return draft.copy(
            cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } },
            numbers = draft.numbers.mapNotNull { (at, n) -> shift(at)?.let { it to n } }.toMap(),
            start = draft.start?.let(::shift),
        )
    }

    /** What the canon can't express: a gate with two different numbers. Blocks creation; no override. */
    fun formatProblems(draft: SlalomDraft): List<String> =
        gates(draft).filter { it.numbers.size > 1 }.map {
            "Gate ${it.label} has two numbers (${it.numbers.joinToString(", ")}): keep one"
        }

    /** Every issue, format problems first, then the misread checks; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: SlalomDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        addAll(formatProblems(draft))
        val gates = gates(draft)
        if (gates.isEmpty()) add("No gates")
        val start = draft.start
        if (start == null || !draft.inGrid(start.second, start.first)) {
            add("No start circle")
        } else {
            val label = "R${start.first + 1}C${start.second + 1}"
            when (draft.cellAt(start.second, start.first)) {
                SlalomCell.WALL -> add("Start $label is on a wall")
                SlalomCell.GATE_H, SlalomCell.GATE_V -> add("Start $label is on a gate")
                SlalomCell.EMPTY -> Unit
            }
        }
        if (draft.gateCount != gates.size) {
            add("Start circle says ${draft.gateCount} but there ${if (gates.size == 1) "is 1 gate" else "are ${gates.size} gates"}")
        }
        for (gate in gates) {
            val n = gate.numbers.singleOrNull() ?: continue
            if (n > draft.gateCount) add("Gate ${gate.label} is number $n, past the ${draft.gateCount} in the start circle")
            val (r0, c0) = gate.cells.first()
            val (r1, c1) = gate.cells.last()
            val (br, bc) = if (gate.vertical) r0 - 1 to c0 else r0 to c0 - 1
            val (ar, ac) = if (gate.vertical) r1 + 1 to c1 else r1 to c1 + 1
            val capped = (draft.inGrid(bc, br) && draft.cellAt(bc, br) == SlalomCell.WALL) ||
                (draft.inGrid(ac, ar) && draft.cellAt(ac, ar) == SlalomCell.WALL)
            if (!capped) add("Gate ${gate.label} is numbered but has no wall at either end to show it")
        }
    }

    private fun gate(draft: SlalomDraft, vertical: Boolean, line: Int, from: Int, to: Int): SlalomDraftGate {
        val cells = (from..to).map { if (vertical) it to line else line to it }
        return SlalomDraftGate(vertical, line, from, to, cells.mapNotNull { draft.numbers[it] }.distinct().sorted())
    }
}
