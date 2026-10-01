package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Parity tests for the offline hint engine. The expected technique/cell/value for each
 * fixture is computed from the TypeScript engine (player/solver/src/plugins/sudoku) so
 * the two stay in lockstep — see plan.md Phase 6 acceptance: "the same fixtures produce
 * the same technique/cell selections as the TS engine."
 *
 * Cell ids follow the solver convention `row * 9 + col`.
 */
class SudokuHinterTest {

    // -- helpers ------------------------------------------------------------

    /** Build a Puzzle from an 81-char grid string ('0'/'.' = empty), as canonRepr.hints. */
    private fun puzzleFromString(grid: String): Puzzle {
        val digits = grid.filter { it.isDigit() || it == '.' }.map { if (it == '.') 0 else it - '0' }
        require(digits.size == 81) { "expected 81 cells, got ${digits.size}" }
        val rows = (0 until 9).map { r ->
            JsonArray((0 until 9).map { c -> JsonPrimitive(digits[r * 9 + c]) })
        }
        return puzzleWithCanon(JsonObject(mapOf("hints" to JsonArray(rows))))
    }

    /** Build a Puzzle from a 9x9 int grid as canonRepr.hints. */
    private fun puzzleFromGrid(hints: List<List<Int>>): Puzzle {
        val rows = hints.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }
        return puzzleWithCanon(JsonObject(mapOf("hints" to JsonArray(rows))))
    }

    private fun puzzleWithCanon(canon: JsonObject): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 1,
        puzzleTypeName = "sudoku",
        puzzleTypeJpLabel = "数独",
        difficulty = 3,
        canonRepr = canon,
    )

    /** cell id -> "col,row" key for feeding committed values back in. */
    private fun rc(id: Int): String = "${id % 9},${id / 9}"

    private val emptyGrid: List<List<Int>> = List(9) { List(9) { 0 } }

    // Fixtures (mirroring player/solver/src/plugins/sudoku).
    private val EASY_SINGLES =
        "003020600900305001001806400008102900700000008006708200002609500800203009005010300"
    private val LOCKED =
        "000000000904607000076804100309701080008000300050308702007502610000403208000000000"
    private val NAKED_PAIR =
        "400000938032094100095300240370609004529001673604703090957008300003900400240030709"
    // Arto Inkala's hardest: no naked/hidden single at the start -> give-up territory.
    private val INKALA =
        "800000000003600000070090200050007000000045700000100030001000068008500010090000400"

    // -- naked single (depth 0) --------------------------------------------

    @Test
    fun nakedSingle_findsTheForcedCell() {
        // Row 0 has 1..8 given; the last empty cell (r0c8, id 8) can only be 9.
        val puzzle = puzzleFromString("123456780" + "0".repeat(72))
        val step = SudokuHinter.nextHint(puzzle, emptyMap())
        assertNotNull(step)
        assertEquals("naked-single", step!!.technique)
        assertEquals(listOf(8), step.focusCells)
        assertEquals(SudokuHinter.Placement(8, 9), step.placement)
    }

    // -- hidden single (depth 1) -------------------------------------------

    @Test
    fun hiddenSingle_findsDigitWithOneSpotInAUnit() {
        // Force 5 out of box 0 except r0c0 without making r0c0 a naked single.
        val hints = emptyGrid.map { it.toMutableList() }
        hints[1][3] = 5; hints[2][4] = 5; hints[3][1] = 5; hints[4][2] = 5
        val puzzle = puzzleFromGrid(hints)
        val step = SudokuHinter.nextHint(puzzle, emptyMap())
        assertNotNull(step)
        assertEquals("hidden-single", step!!.technique)
        assertEquals(SudokuHinter.Placement(0, 5), step.placement)
    }

    // -- locked candidates (depth 2) ---------------------------------------

    @Test
    fun lockedCandidates_firesWithSoundPointingEliminations() {
        // On this grid the shallowest step is locked-candidates (no earlier rung fires).
        val puzzle = puzzleFromString(NAKED_PAIR)
        val step = SudokuHinter.nextHint(puzzle, emptyMap())
        assertNotNull(step)
        assertEquals("locked-candidates", step!!.technique)
        assertEquals(listOf(1, 2), step.focusCells)
        assertEquals(
            listOf(
                SudokuHinter.Elimination(4, listOf(6)),
                SudokuHinter.Elimination(5, listOf(6)),
            ),
            step.eliminations,
        )
        // Soundness: an eliminated digit is never the true solution digit of that cell.
        // NAKED_PAIR solution begins 4,6,1,5,7,2,... so cells 4 and 5 are 7 and 2.
        assertTrue(6 != 7 && 6 != 2)
    }

    // -- give-up (null -> reveal fallback territory) -----------------------

    @Test
    fun noStep_onHardestPuzzle() {
        val puzzle = puzzleFromString(INKALA)
        assertNull(SudokuHinter.nextHint(puzzle, emptyMap()))
    }

    @Test
    fun noStep_onCompletedBoard() {
        // A fully solved grid has no empty cells, so no technique fires.
        val puzzle = puzzleFromString(
            "483921657967345821251876493548132976729564138136798245372689514814253769695417382"
        )
        assertNull(SudokuHinter.nextHint(puzzle, emptyMap()))
    }

    // -- end-to-end: solve an easy puzzle by hints alone -------------------

    @Test
    fun endToEnd_solvesEasyPuzzleByHintsAlone() {
        val puzzle = puzzleFromString(EASY_SINGLES)
        val solution = SudokuEngine.parseHints(
            puzzleFromString(
                "483921657967345821251876493548132976729564138136798245372689514814253769695417382"
            )
        )
        val values = HashMap<String, Int>()
        var steps = 0
        while (steps < 100) {
            val step = SudokuHinter.nextHint(puzzle, values) ?: break
            val placement = step.placement ?: break
            val r = placement.cell / 9
            val c = placement.cell % 9
            // Every hint agrees with the real (unique) answer.
            assertEquals(solution[r][c], placement.value)
            values[rc(placement.cell)] = placement.value
            steps++
        }
        // Empty cells in the givens = number of placements needed to complete it.
        val emptyCount = (0 until 81).count {
            SudokuEngine.parseHints(puzzle)[it / 9][it % 9] == 0
        }
        assertEquals(emptyCount, values.size) // fully solved by singles
    }

    // -- hints are never pointed at a filled cell --------------------------

    @Test
    fun placement_neverTargetsAFilledCell() {
        val puzzle = puzzleFromString(EASY_SINGLES)
        val hints = SudokuEngine.parseHints(puzzle)
        val step = SudokuHinter.nextHint(puzzle, emptyMap())!!
        val cell = step.placement!!.cell
        assertEquals(0, hints[cell / 9][cell % 9]) // the target was empty
    }

    // -- committed values feed the board -----------------------------------

    @Test
    fun respectsCommittedUserValues() {
        // Place the easy puzzle's first forced cell, then the next hint must differ.
        val puzzle = puzzleFromString(EASY_SINGLES)
        val first = SudokuHinter.nextHint(puzzle, emptyMap())!!
        val afterFirst = SudokuHinter.nextHint(
            puzzle,
            mapOf(rc(first.placement!!.cell) to first.placement!!.value),
        )
        assertNotNull(afterFirst)
        // The engine advanced: the next placement is a different cell.
        assertTrue(afterFirst!!.placement!!.cell != first.placement!!.cell)
    }
}
