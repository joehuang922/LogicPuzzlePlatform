package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KakuroEngineTest {

    // -- helpers ------------------------------------------------------------

    /** Build a Puzzle from a raw canonRepr JSON string. */
    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "k1",
        puzzleType = 12,
        puzzleTypeName = "kakuro",
        puzzleTypeJpLabel = "カックロ",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    /** A tiny 3x3 kakuro (see the run/solution breakdown below). */
    private val canon3x3 = """
        {"cells":[
          [{"type":"clue"},{"type":"clue","down":4},{"type":"clue","down":6}],
          [{"type":"clue","right":3},{"type":"empty"},{"type":"empty"}],
          [{"type":"clue","right":7},{"type":"empty"},{"type":"empty"}]
        ]}
    """.trimIndent()
    // Layout (col,row):
    //   (1,1),(2,1): row run right=3  -> a+b=3
    //   (1,2),(2,2): row run right=7  -> c+d=7
    //   (1,1),(1,2): col run down=4   -> a+c=4
    //   (2,1),(2,2): col run down=6   -> b+d=6
    // Solve: a+b=3, a+c=4, c+d=7, b+d=6. a=1,b=2,c=3,d=4 works (1+2=3, 3+4=7, 1+3=4, 2+4=6).
    private val solution = mapOf("1,1" to 1, "2,1" to 2, "1,2" to 3, "2,2" to 4)

    // -- parseCells ---------------------------------------------------------

    @Test
    fun parseCells_readsClueAndEmpty() {
        val cells = KakuroEngine.parseCells(puzzle(canon3x3))
        assertEquals(3, cells.size)
        assertTrue(cells[0][0] is KakuroEngine.Cell.Clue)
        assertEquals(4, (cells[0][1] as KakuroEngine.Cell.Clue).down)
        assertEquals(3, (cells[1][0] as KakuroEngine.Cell.Clue).right)
        assertTrue(cells[1][1] is KakuroEngine.Cell.Empty)
    }

    // -- getRuns ------------------------------------------------------------

    @Test
    fun getRuns_findsHorizontalAndVerticalRuns() {
        val cells = KakuroEngine.parseCells(puzzle(canon3x3))
        val runs = KakuroEngine.getRuns(cells)
        // 2 horizontal (right clues) + 2 vertical (down clues).
        assertEquals(4, runs.size)
        val h = runs.filter { it.direction == 'h' }.sortedBy { it.sum }
        assertEquals(listOf(3, 7), h.map { it.sum })
        val v = runs.filter { it.direction == 'v' }.sortedBy { it.sum }
        assertEquals(listOf(4, 6), v.map { it.sum })
        h.forEach { assertEquals(2, it.length) }
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_placesUserDigitsAndZeroesClues() {
        val answer = KakuroEngine.extractAnswer(puzzle(canon3x3), solution)
        val rows = (answer["values"] as JsonArray).map { it.jsonArray }
        assertEquals(3, rows.size)
        // Clue cells are 0.
        assertEquals(0, rows[0][0].jsonPrimitive.int)
        assertEquals(0, rows[1][0].jsonPrimitive.int)
        // Empty cells hold the player's digits.
        assertEquals(1, rows[1][1].jsonPrimitive.int)
        assertEquals(2, rows[1][2].jsonPrimitive.int)
        assertEquals(3, rows[2][1].jsonPrimitive.int)
        assertEquals(4, rows[2][2].jsonPrimitive.int)
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroWhenEmptyFullWhenSolved() {
        val p = puzzle(canon3x3)
        assertEquals(0.0, KakuroEngine.computeProgress(p, emptyMap()), 0.0001)
        assertEquals(100.0, KakuroEngine.computeProgress(p, solution), 0.0001)
        // Fill 2 of 4 empties.
        assertEquals(50.0, KakuroEngine.computeProgress(p, mapOf("1,1" to 1, "2,1" to 2)), 0.0001)
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon3x3)
        val answer = KakuroEngine.extractAnswer(p, solution)
        val restored = KakuroEngine.restoreUserValues(p, answer)
        assertEquals(solution, restored)
    }

    // -- analyze (live validation) -----------------------------------------

    @Test
    fun analyze_cleanWhenEmptyOrPartialUnderTarget() {
        val p = puzzle(canon3x3)
        assertTrue(KakuroEngine.analyze(p, emptyMap()).cellErrors.isEmpty())
        // Partial, still under every sum -> no certain violation.
        val a = KakuroEngine.analyze(p, mapOf("1,1" to 1))
        assertTrue(a.cellErrors.isEmpty())
        assertTrue(a.clueErrors.isEmpty())
    }

    @Test
    fun analyze_flagsDuplicateWithinRun() {
        val p = puzzle(canon3x3)
        // Row run right=7 at row 2 with duplicate digits.
        val a = KakuroEngine.analyze(p, mapOf("1,2" to 3, "2,2" to 3))
        assertTrue(a.cellErrors.contains("1,2"))
        assertTrue(a.cellErrors.contains("2,2"))
    }

    @Test
    fun analyze_flagsFilledRunWithWrongSum() {
        val p = puzzle(canon3x3)
        // Row run right=3 fully filled to 1+9=10 (also over) -> both cell + clue error.
        val a = KakuroEngine.analyze(p, mapOf("1,1" to 1, "2,1" to 9))
        assertTrue(a.cellErrors.contains("1,1"))
        assertTrue(a.cellErrors.contains("2,1"))
        assertTrue(a.clueErrors.contains("0,1:right"))
    }

    @Test
    fun analyze_flagsPartialRunAlreadyOverTarget() {
        val p = puzzle(canon3x3)
        // Col run down=4 (clue at (1,0)); a single 9 already exceeds 4.
        val a = KakuroEngine.analyze(p, mapOf("1,1" to 9))
        assertTrue(a.cellErrors.contains("1,1"))
        assertTrue(a.clueErrors.contains("1,0:down"))
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForCorrectSolution() {
        assertTrue(KakuroEngine.isComplete(puzzle(canon3x3), solution))
    }

    @Test
    fun isComplete_falseWhenNotFullyFilled() {
        assertFalse(KakuroEngine.isComplete(puzzle(canon3x3), solution - "2,2"))
    }

    @Test
    fun isComplete_falseWhenFullButWrongSum() {
        val p = puzzle(canon3x3)
        // Swap so a row sum is wrong: (1,1)=2,(2,1)=2 keeps cols? just break one row.
        val broken = solution + ("1,1" to 3) // row1 becomes 3+2=5 != 3
        assertFalse(KakuroEngine.isComplete(p, broken))
    }

    // -- ragged / missing tolerance ----------------------------------------

    @Test
    fun parseCells_missingCellsKeyYieldsEmpty() {
        val p = puzzle("""{}""")
        assertTrue(KakuroEngine.parseCells(p).isEmpty())
        assertEquals(100.0, KakuroEngine.computeProgress(p, emptyMap()), 0.0001)
        assertTrue(KakuroEngine.isComplete(p, emptyMap()))
    }
}
