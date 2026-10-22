package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.YajilinEngine.Clue
import com.puzzleplatform.player.puzzle.YajilinEngine.Dir
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable clue grid of a yajilin being authored: cells[r][c] is an arrow clue
 * (direction + count) or null for an empty cell. Always rectangular.
 */
data class YajilinDraft(val cells: List<List<Clue?>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): Clue? = cells.getOrNull(row)?.getOrNull(col)
}

/**
 * Pure helpers for authoring a yajilin question in the Admin screen, the analog of
 * frontend/src/components/YajilinEditor.tsx. The parser returns the canon `{ cells }`
 * directly; the review step fixes mis-read arrows and counts and phantom/missed lines.
 *
 * Yajilin has no solver gate, so the server only checks the schema. [problems] catches
 * what can't be right on its face: no clues at all, and a clue asking for more shaded
 * cells than fit in its direction (shaded cells can't touch, and clue cells can't be
 * shaded, so each stretch of L free cells holds at most ceil(L/2)).
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object YajilinAuthoring {

    const val PUZZLE_TYPE = 13

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with empty cells. */
    fun draftFromCanon(canon: JsonObject): YajilinDraft {
        val parsed = YajilinEngine.parseCells(previewPuzzle(YajilinDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return YajilinDraft(parsed.map { row -> row + List(cols - row.size) { null } })
    }

    /** The canon `{ cells }` to POST; an empty cell is `null`. */
    fun canonFromDraft(draft: YajilinDraft): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(draft.cells.map { row ->
                JsonArray(row.map { clue ->
                    if (clue == null) JsonNull
                    else JsonObject(mapOf("dir" to JsonPrimitive(dirName(clue.dir)), "num" to JsonPrimitive(clue.num)))
                })
            })
        )
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: YajilinDraft): Puzzle = Puzzle(
        id = "admin-yajilin-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "yajilin",
        puzzleTypeJpLabel = "ヤジリン",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Make (col, row) empty. */
    fun clear(draft: YajilinDraft, col: Int, row: Int): YajilinDraft = setCell(draft, col, row, null)

    /** Point the clue at (col, row) in [dir], keeping its count; an empty cell becomes a 0 clue. */
    fun setDir(draft: YajilinDraft, col: Int, row: Int, dir: Dir): YajilinDraft =
        setCell(draft, col, row, Clue(dir, draft.cellAt(col, row)?.num ?: 0))

    /** Set the count of the clue at (col, row). No-op on an empty cell or a negative count. */
    fun setNum(draft: YajilinDraft, col: Int, row: Int, num: Int): YajilinDraft {
        val clue = draft.cellAt(col, row) ?: return draft
        return if (num < 0) draft else setCell(draft, col, row, clue.copy(num = num))
    }

    /** Parse a typed count: digits only; blank -> null. */
    fun parseNum(text: String): Int? = text.filter { it.isDigit() }.take(2).toIntOrNull()

    /** Append an empty row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: YajilinDraft): YajilinDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { null }))

    /** Append an empty column at the right. */
    fun addCol(draft: YajilinDraft): YajilinDraft =
        draft.copy(cells = draft.cells.map { it + null })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: YajilinDraft, row: Int): YajilinDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: YajilinDraft, col: Int): YajilinDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Most cells that can be shaded in [dir] from (col, row): ceil(L/2) per stretch of L non-clue cells. */
    fun maxShaded(draft: YajilinDraft, col: Int, row: Int, dir: Dir): Int {
        val (dc, dr) = step(dir)
        var total = 0
        var run = 0
        var c = col + dc
        var r = row + dr
        while (draft.inGrid(c, r)) {
            if (draft.cellAt(c, r) == null) run++ else { total += (run + 1) / 2; run = 0 }
            c += dc; r += dr
        }
        return total + (run + 1) / 2
    }

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: YajilinDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.all { row -> row.all { it == null } }) add("No clues")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val clue = draft.cells[r][c] ?: continue
                val max = maxShaded(draft, c, r, clue.dir)
                if (clue.num > max) {
                    add("R${r + 1}C${c + 1} ${arrow(clue.dir)}${clue.num} can't fit: at most $max shaded that way")
                }
            }
        }
    }

    fun arrow(dir: Dir): String = when (dir) {
        Dir.UP -> "↑"
        Dir.DOWN -> "↓"
        Dir.LEFT -> "←"
        Dir.RIGHT -> "→"
    }

    private fun dirName(dir: Dir): String = dir.name.lowercase()

    private fun step(dir: Dir): Pair<Int, Int> = when (dir) {
        Dir.UP -> 0 to -1
        Dir.DOWN -> 0 to 1
        Dir.LEFT -> -1 to 0
        Dir.RIGHT -> 1 to 0
    }

    private fun setCell(draft: YajilinDraft, col: Int, row: Int, clue: Clue?): YajilinDraft {
        if (!draft.inGrid(col, row)) return draft
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) clue else old }
        })
    }
}
