package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.floor

/**
 * Pure helpers for authoring a picturesque maze in the Admin screen, the analog of
 * frontend/src/components/PicturesqueMazeEditor.tsx. The draft is the
 * [PicturesqueMazeEngine.Board].
 *
 * A tap on an interior edge toggles its wall; a tap on a border edge moves the entrance
 * (or the exit, in Exit mode) there. [formatProblems] mirrors the web editor's (and the
 * API's) checks and blocks creating or saving; "not a perfect maze" stays overridable.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object PicturesqueMazeAuthoring {

    const val PUZZLE_TYPE = 44

    /** What a tap lands on: an interior wall ("h"/"v" at r, c) or a border opening. */
    sealed interface Target {
        data class Wall(val kind: String, val r: Int, val c: Int) : Target
        data class Border(val opening: PicturesqueMazeEngine.Opening) : Target
    }

    fun draftFromCanon(canon: JsonObject): PicturesqueMazeEngine.Board = PicturesqueMazeEngine.parseBoard(canon)

    /** The canon `{ width, height, walls, entrance, exit }` to POST. */
    fun canonFromDraft(draft: PicturesqueMazeEngine.Board): JsonObject {
        fun grid(g: List<List<Int>>) = JsonArray(g.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        fun opening(o: PicturesqueMazeEngine.Opening) =
            JsonObject(mapOf("side" to JsonPrimitive(o.side), "index" to JsonPrimitive(o.index)))
        return JsonObject(
            mapOf(
                "width" to JsonPrimitive(draft.cols),
                "height" to JsonPrimitive(draft.rows),
                "walls" to JsonObject(mapOf("h" to grid(draft.wallsH), "v" to grid(draft.wallsV))),
                "entrance" to opening(draft.entrance),
                "exit" to opening(draft.exit),
            ),
        )
    }

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: PicturesqueMazeEngine.Board): Puzzle = Puzzle(
        id = "admin-picturesque-maze-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "picturesque-maze",
        puzzleTypeJpLabel = "浮き出しメイロ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /**
     * The edge nearest a tap at fractional (col, row), within 0.3 cell, as the web
     * editor's targetAt: an interior wall or a border opening.
     */
    fun targetAt(draft: PicturesqueMazeEngine.Board, col: Float, row: Float): Target? {
        val c = floor(col).toInt()
        val r = floor(row).toInt()
        val fx = col - c
        val fy = row - r
        val (dist, dir) = listOf(fy to "top", 1 - fy to "bottom", fx to "left", 1 - fx to "right").minBy { it.first }
        if (dist > 0.3f) return null
        if (dir == "top" || dir == "bottom") {
            if (c !in 0 until draft.cols) return null
            val line = if (dir == "top") r else r + 1
            return when {
                line == 0 -> Target.Border(PicturesqueMazeEngine.Opening("top", c))
                line == draft.rows -> Target.Border(PicturesqueMazeEngine.Opening("bottom", c))
                line in 1 until draft.rows -> Target.Wall("h", line - 1, c)
                else -> null
            }
        }
        if (r !in 0 until draft.rows) return null
        val line = if (dir == "left") c else c + 1
        return when {
            line == 0 -> Target.Border(PicturesqueMazeEngine.Opening("left", r))
            line == draft.cols -> Target.Border(PicturesqueMazeEngine.Opening("right", r))
            line in 1 until draft.cols -> Target.Wall("v", r, line - 1)
            else -> null
        }
    }

    /** Apply a tap: toggle the wall, or move the entrance ([asExit] false) / exit to the border edge. */
    fun tap(draft: PicturesqueMazeEngine.Board, col: Float, row: Float, asExit: Boolean): PicturesqueMazeEngine.Board =
        when (val t = targetAt(draft, col, row)) {
            null -> draft
            is Target.Wall -> toggleWall(draft, t.kind, t.r, t.c)
            is Target.Border -> if (asExit) draft.copy(exit = t.opening) else draft.copy(entrance = t.opening)
        }

    fun toggleWall(draft: PicturesqueMazeEngine.Board, kind: String, r: Int, c: Int): PicturesqueMazeEngine.Board {
        fun flip(g: List<List<Int>>) = g.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) 1 - v else v }
        }
        return if (kind == "h") draft.copy(wallsH = flip(draft.wallsH)) else draft.copy(wallsV = flip(draft.wallsV))
    }

    fun addRow(draft: PicturesqueMazeEngine.Board) = resized(draft, draft.rows + 1, draft.cols)

    fun addCol(draft: PicturesqueMazeEngine.Board) = resized(draft, draft.rows, draft.cols + 1)

    fun removeLastRow(draft: PicturesqueMazeEngine.Board) =
        if (draft.rows <= 2) draft else resized(draft, draft.rows - 1, draft.cols)

    fun removeLastCol(draft: PicturesqueMazeEngine.Board) =
        if (draft.cols <= 2) draft else resized(draft, draft.rows, draft.cols - 1)

    /** Resize at the bottom / right, as the web editor: new edges are walls, openings that fall off move to index 0. */
    private fun resized(draft: PicturesqueMazeEngine.Board, rows: Int, cols: Int): PicturesqueMazeEngine.Board {
        fun fit(o: PicturesqueMazeEngine.Opening) =
            if (PicturesqueMazeEngine.openingCell(o, rows, cols) != null) o else o.copy(index = 0)
        return PicturesqueMazeEngine.Board(
            rows = rows,
            cols = cols,
            wallsH = List(rows - 1) { r -> List(cols) { c -> draft.wallsH.getOrNull(r)?.getOrNull(c) ?: 1 } },
            wallsV = List(rows) { r -> List(cols - 1) { c -> draft.wallsV.getOrNull(r)?.getOrNull(c) ?: 1 } },
            entrance = fit(draft.entrance),
            exit = fit(draft.exit),
        )
    }

    /** Problems the API rejects too (port of picturesqueMazeFormatProblems); they block saving. */
    fun formatProblems(draft: PicturesqueMazeEngine.Board): List<String> = PicturesqueMazeEngine.formatProblems(draft)

    /** Everything that turns a batch tile red: the format problems, then the misread warnings. */
    fun problems(draft: PicturesqueMazeEngine.Board): List<String> = buildList {
        if (draft.rows < 2 || draft.cols < 2) {
            add("No cells")
            return@buildList
        }
        addAll(formatProblems(draft))
        addAll(PicturesqueMazeEngine.warningMessages(PicturesqueMazeEngine.warnings(draft)))
    }
}
