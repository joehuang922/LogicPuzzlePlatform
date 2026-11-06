package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle

/**
 * Offline hints for combo sudoku: the shared [UnitHinter] ladder over the layout's
 * geometry, the port of player/solver/src/plugins/combo-sudoku/board.ts. Cells are every
 * covered cell in reading order (top row first); units are each board's rows, then each
 * board's columns, then the boxes, a room two boards share counted once. Step cell ids
 * index [geometry]; its `key` gives the client's global "col,row".
 */
object ComboSudokuHinter {

    fun geometry(subboards: List<ComboSudokuEngine.Subboard>): UnitHinter.Geometry {
        val cells = subboards
            .flatMap { sb -> (0 until 81).map { sb.col0 + it % 9 to sb.row0 + it / 9 } }
            .distinct()
            .sortedWith(compareBy({ it.second }, { it.first }))
        val ids = cells.withIndex().associate { (id, cr) -> cr to id }
        fun at(c: Int, r: Int) = ids.getValue(c to r)

        val units = mutableListOf<IntArray>()
        val kinds = mutableListOf<UnitHinter.Kind>()
        val labels = mutableListOf<String>()
        fun boardName(i: Int) = if (subboards.size > 1) "board ${i + 1} " else ""
        subboards.forEachIndexed { i, sb ->
            for (r in 0 until 9) {
                units += IntArray(9) { c -> at(sb.col0 + c, sb.row0 + r) }
                kinds += UnitHinter.Kind.ROW
                labels += "${boardName(i)}row ${r + 1}"
            }
        }
        subboards.forEachIndexed { i, sb ->
            for (c in 0 until 9) {
                units += IntArray(9) { r -> at(sb.col0 + c, sb.row0 + r) }
                kinds += UnitHinter.Kind.COL
                labels += "${boardName(i)}column ${c + 1}"
            }
        }
        val seenRooms = mutableSetOf<Pair<Int, Int>>()
        subboards.forEachIndexed { i, sb ->
            for (k in 0 until 9) {
                val room = sb.x + k % 3 to sb.y + k / 3
                if (!seenRooms.add(room)) continue
                units += IntArray(9) { d -> at(3 * room.first + d % 3, 3 * room.second + d / 3) }
                kinds += UnitHinter.Kind.BOX
                labels += "${boardName(i)}box ${k + 1}"
            }
        }
        return UnitHinter.Geometry(
            size = cells.size,
            units = units,
            kinds = kinds,
            key = { id -> "${cells[id].first},${cells[id].second}" },
            cellLabel = { id -> "R${cells[id].second + 1}C${cells[id].first + 1}" },
            unitLabel = { u -> labels[u] },
        )
    }

    /** Givens (merged across boards) win; otherwise the player's entry at "col,row". */
    private fun board(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Board {
        val layout = ComboSudokuEngine.layout(puzzle)
        val geo = geometry(layout.subboards)
        val values = IntArray(geo.size) { id ->
            val key = geo.key(id)
            val v = layout.givens[key] ?: userValues[key] ?: 0
            if (v in 1..9) v else 0
        }
        return UnitHinter.Board.build(geo, values)
    }

    /**
     * The next answer cell as its "col,row" key (see [UnitHinter.nextPlacement]), with
     * its label, or null when the ladder runs dry.
     */
    fun nextCell(puzzle: Puzzle, userValues: Map<String, Int>): Pair<String, String>? {
        val board = board(puzzle, userValues)
        val cell = UnitHinter.nextPlacement(board)?.placement?.cell ?: return null
        return board.geo.key(cell) to board.geo.cellLabel(cell)
    }

    /** The full step (for tests and parity with the TS engine). */
    fun nextPlacement(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Step? =
        UnitHinter.nextPlacement(board(puzzle, userValues))
}
