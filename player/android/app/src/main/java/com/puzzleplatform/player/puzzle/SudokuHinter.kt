package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle

/**
 * Offline hints for Sudoku: the shared [UnitHinter] ladder over the board's N x N
 * geometry (the port of player/solver/src/plugins/sudoku): 9x9 with 3x3 rooms, or up to
 * 30x30 with room_width x room_height rooms. Cell ids are the solver convention
 * `row * N + col`; convert to the client's "col,row" with [cellKey]. No backtracker on
 * device (plan.md D6); the uniqueness gate stays server-side.
 */
object SudokuHinter {

    /** Client cell key ("col,row") for a solver cell id on an N-wide board. */
    fun cellKey(id: Int, n: Int = 9): String = "${id % n},${id / n}"

    /** Human-readable cell label, e.g. id 30 -> "R4C4" on a 9x9. */
    fun cellLabel(id: Int, n: Int = 9): String = "R${id / n + 1}C${id % n + 1}"

    private val geometries = HashMap<SudokuEngine.Dims, UnitHinter.Geometry>()

    /**
     * Units: N rows, then N columns, then N rooms in reading order, matching the TS
     * sudokuUnits order. Cached per room size.
     */
    fun geometry(dims: SudokuEngine.Dims): UnitHinter.Geometry = synchronized(geometries) {
        geometries.getOrPut(dims) {
            val n = dims.size
            val (w, h) = dims.roomWidth to dims.roomHeight
            val units = buildList {
                for (r in 0 until n) add(IntArray(n) { c -> r * n + c })
                for (c in 0 until n) add(IntArray(n) { r -> r * n + c })
                for (br in 0 until n step h) {
                    for (bc in 0 until n step w) add(IntArray(n) { k -> (br + k / w) * n + bc + k % w })
                }
            }
            UnitHinter.Geometry(
                size = n * n,
                units = units,
                kinds = List(3 * n) { u -> if (u < n) UnitHinter.Kind.ROW else if (u < 2 * n) UnitHinter.Kind.COL else UnitHinter.Kind.BOX },
                key = { id -> cellKey(id, n) },
                cellLabel = { id -> cellLabel(id, n) },
                unitLabel = { u ->
                    when {
                        u < n -> "row ${u + 1}"
                        u < 2 * n -> "column ${u - n + 1}"
                        else -> "box ${u - 2 * n + 1}"
                    }
                },
            )
        }
    }

    /** The standard 9x9 geometry. */
    val GEOMETRY: UnitHinter.Geometry get() = geometry(SudokuEngine.Dims())

    /** Givens win; otherwise the player's entry keyed "col,row" ("n:" notes ignored). */
    private fun board(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Board {
        val geo = geometry(SudokuEngine.dims(puzzle))
        val n = geo.digits
        val hints = SudokuEngine.parseHints(puzzle)
        val values = IntArray(n * n) { id ->
            val hint = hints.getOrNull(id / n)?.getOrNull(id % n) ?: 0
            if (hint != 0) hint else userValues[cellKey(id, n)] ?: 0
        }
        return UnitHinter.Board.build(geo, values)
    }

    /** The shallowest rung that fires on the player's board, or null. */
    fun nextHint(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Step? =
        UnitHinter.nextHint(board(puzzle, userValues))

    /** The next answer cell (see [UnitHinter.nextPlacement]), or null when the ladder runs dry. */
    fun nextPlacement(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Step? =
        UnitHinter.nextPlacement(board(puzzle, userValues))
}
