package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle

/**
 * Offline hints for Sudoku: the shared [UnitHinter] ladder over the 9x9 geometry (the
 * port of player/solver/src/plugins/sudoku). Cell ids are the solver convention
 * `row * 9 + col`; convert to the client's "col,row" with [cellKey]. No backtracker on
 * device (plan.md D6); the uniqueness gate stays server-side.
 */
object SudokuHinter {

    private const val N = 9

    /** Client cell key ("col,row") for a solver cell id. */
    fun cellKey(id: Int): String = "${id % N},${id / N}"

    /** Human-readable cell label, e.g. id 30 -> "R4C4". */
    fun cellLabel(id: Int): String = "R${id / N + 1}C${id % N + 1}"

    /** Units: 9 rows, then 9 columns, then 9 boxes, matching the TS UNITS order. */
    val GEOMETRY: UnitHinter.Geometry = run {
        val units = buildList {
            for (r in 0 until N) add(IntArray(N) { c -> r * N + c })
            for (c in 0 until N) add(IntArray(N) { r -> r * N + c })
            for (br in 0 until N step 3) {
                for (bc in 0 until N step 3) add(IntArray(N) { k -> (br + k / 3) * N + bc + k % 3 })
            }
        }
        UnitHinter.Geometry(
            size = N * N,
            units = units,
            kinds = List(27) { u -> if (u < 9) UnitHinter.Kind.ROW else if (u < 18) UnitHinter.Kind.COL else UnitHinter.Kind.BOX },
            key = ::cellKey,
            cellLabel = ::cellLabel,
            unitLabel = { u ->
                when {
                    u < 9 -> "row ${u + 1}"
                    u < 18 -> "column ${u - 9 + 1}"
                    else -> "box ${u - 18 + 1}"
                }
            },
        )
    }

    /** Givens win; otherwise the player's entry keyed "col,row" ("n:" notes ignored). */
    private fun board(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Board {
        val hints = SudokuEngine.parseHints(puzzle)
        val values = IntArray(N * N) { id ->
            val hint = hints.getOrNull(id / N)?.getOrNull(id % N) ?: 0
            if (hint != 0) hint else userValues[cellKey(id)] ?: 0
        }
        return UnitHinter.Board.build(GEOMETRY, values)
    }

    /** The shallowest rung that fires on the player's board, or null. */
    fun nextHint(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Step? =
        UnitHinter.nextHint(board(puzzle, userValues))

    /** The next answer cell (see [UnitHinter.nextPlacement]), or null when the ladder runs dry. */
    fun nextPlacement(puzzle: Puzzle, userValues: Map<String, Int>): UnitHinter.Step? =
        UnitHinter.nextPlacement(board(puzzle, userValues))
}
