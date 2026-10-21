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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PictoLinkEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 27,
        puzzleTypeName = "picto-link",
        puzzleTypeJpLabel = "ピクトリンク",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // The docs/picto-link example:
    //   2 . . . 1
    //   2 . . . .
    //   . 4 . . 4
    //   . . . . .
    //   . . . . .
    // The 2s join straight down, the 4s straight across row 2, and the 1 is a single.
    private val docPuzzle = puzzle(
        """{"cells":[[2,0,0,0,1],[2,0,0,0,0],[0,4,0,0,4],[0,0,0,0,0],[0,0,0,0,0]]}"""
    )

    private val solved = mapOf(
        "v:0,0" to 1,
        "h:2,1" to 1, "h:2,2" to 1, "h:2,3" to 1,
        "s:0,4" to 1,
    )

    private fun JsonObject.edgeGrid(which: String): List<List<Int>> =
        ((this["edges"] as JsonObject)[which] as JsonArray).map { row ->
            row.jsonArray.map { it.jsonPrimitive.int }
        }

    // -- extract / restore --------------------------------------------------

    @Test
    fun extractAnswer_matchesTheDocsAnswer() {
        val answer = PictoLinkEngine.extractAnswer(docPuzzle, solved)
        assertEquals(
            listOf(listOf(0, 0, 0, 0), listOf(0, 0, 0, 0), listOf(0, 1, 1, 1), listOf(0, 0, 0, 0), listOf(0, 0, 0, 0)),
            answer.edgeGrid("h"),
        )
        val v = answer.edgeGrid("v")
        assertEquals(4, v.size)
        assertEquals(listOf(1, 0, 0, 0, 0), v[0])
        assertTrue(v.drop(1).all { row -> row.all { it == 0 } })
        val singles = (answer["singles"] as JsonArray).map { p -> p.jsonArray.map { it.jsonPrimitive.int } }
        assertEquals(listOf(listOf(0, 4)), singles)
    }

    @Test
    fun extractAnswer_dropsOutOfBoundsAndZeroKeys() {
        val answer = PictoLinkEngine.extractAnswer(docPuzzle, mapOf("h:9,9" to 1, "s:7,0" to 1, "s:0,4" to 0))
        assertTrue(answer.edgeGrid("h").all { row -> row.all { it == 0 } })
        assertEquals(0, (answer["singles"] as JsonArray).size)
    }

    @Test
    fun restoreUserValues_roundTripsAnExtractedAnswer() {
        val answer = PictoLinkEngine.extractAnswer(docPuzzle, solved)
        assertEquals(solved, PictoLinkEngine.restoreUserValues(docPuzzle, answer))
    }

    @Test
    fun restoreUserValues_readsAWebSaveWithoutSingles() {
        val answer = Json.parseToJsonElement(
            """{"edges":{"h":[[0,0,0,0],[0,0,0,0],[0,1,1,1],[0,0,0,0],[0,0,0,0]],"v":[[1,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]}}"""
        ) as JsonObject
        assertEquals(solved - "s:0,4", PictoLinkEngine.restoreUserValues(docPuzzle, answer))
    }

    // -- progress -----------------------------------------------------------

    @Test
    fun progress_isZeroOnAnEmptyBoard() {
        assertEquals(0.0, PictoLinkEngine.computeProgress(docPuzzle, emptyMap()), 1e-9)
    }

    @Test
    fun progress_countsEachCorrectlyLinkedClueCell() {
        // 5 clue cells: the single alone is 1/5.
        assertEquals(20.0, PictoLinkEngine.computeProgress(docPuzzle, mapOf("s:0,4" to 1)), 1e-9)
        // The 2-pair adds both its endpoints.
        assertEquals(60.0, PictoLinkEngine.computeProgress(docPuzzle, mapOf("s:0,4" to 1, "v:0,0" to 1)), 1e-9)
        assertEquals(100.0, PictoLinkEngine.computeProgress(docPuzzle, solved), 1e-9)
    }

    @Test
    fun progress_ignoresAPairJoinedByAPathOfTheWrongLength() {
        // 4s joined the long way round: (2,1) down, across row 3, up to (2,4) = 6 cells.
        val detour = mapOf("v:2,1" to 1, "h:3,1" to 1, "h:3,2" to 1, "h:3,3" to 1, "v:2,4" to 1)
        assertEquals(0.0, PictoLinkEngine.computeProgress(docPuzzle, detour), 1e-9)
    }

    // -- completion ---------------------------------------------------------

    @Test
    fun isComplete_trueForTheSolution() {
        assertTrue(PictoLinkEngine.isComplete(docPuzzle, solved))
    }

    @Test
    fun isComplete_falseOnAnEmptyBoard() {
        assertFalse(PictoLinkEngine.isComplete(docPuzzle, emptyMap()))
    }

    @Test
    fun isComplete_falseWhenTheSingleIsNotFilled() {
        assertFalse(PictoLinkEngine.isComplete(docPuzzle, solved - "s:0,4"))
    }

    @Test
    fun isComplete_falseForAPathOfTheWrongLength() {
        val detour = solved - listOf("h:2,1", "h:2,2", "h:2,3") +
            mapOf("v:2,1" to 1, "h:3,1" to 1, "h:3,2" to 1, "h:3,3" to 1, "v:2,4" to 1)
        assertFalse(PictoLinkEngine.isComplete(docPuzzle, detour))
    }

    @Test
    fun isComplete_falseWithAStrayLoop() {
        val loop = mapOf("h:3,0" to 1, "h:4,0" to 1, "v:3,0" to 1, "v:3,1" to 1)
        assertFalse(PictoLinkEngine.isComplete(docPuzzle, solved + loop))
    }

    @Test
    fun isComplete_falseForAFillThatIsNotAOneClue() {
        assertFalse(PictoLinkEngine.isComplete(docPuzzle, solved + ("s:4,4" to 1)))
    }

    @Test
    fun isComplete_falseWhenJoiningDifferentValues() {
        // A 2 and a 3 side by side: one segment joins them, but they aren't a pair.
        val p = puzzle("""{"cells":[[2,3]]}""")
        assertFalse(PictoLinkEngine.isComplete(p, mapOf("h:0,0" to 1)))
    }

    // -- taps ---------------------------------------------------------------

    @Test
    fun tapChanges_togglesASingle() {
        val cells = PictoLinkEngine.parseCells(docPuzzle)
        assertEquals(mapOf("s:0,4" to 1), PictoLinkEngine.tapChanges(cells, emptyMap(), 0, 4))
        assertEquals(mapOf("s:0,4" to 0), PictoLinkEngine.tapChanges(cells, mapOf("s:0,4" to 1), 0, 4))
    }

    @Test
    fun tapChanges_clearsTheSegmentsOfAPathCell() {
        val cells = PictoLinkEngine.parseCells(docPuzzle)
        assertEquals(mapOf("h:2,1" to 0, "h:2,2" to 0), PictoLinkEngine.tapChanges(cells, solved, 2, 2))
    }

    @Test
    fun tapChanges_doesNothingOnPairCluesOrUnusedCells() {
        val cells = PictoLinkEngine.parseCells(docPuzzle)
        assertNull(PictoLinkEngine.tapChanges(cells, solved, 2, 1))
        assertNull(PictoLinkEngine.tapChanges(cells, solved, 4, 4))
    }

    @Test
    fun maxDegree_capsPathsAtCluesAndSingles() {
        assertEquals(2, PictoLinkEngine.maxDegree(0))
        assertEquals(0, PictoLinkEngine.maxDegree(1))
        assertEquals(1, PictoLinkEngine.maxDegree(7))
    }

    // -- thumbnail ----------------------------------------------------------

    @Test
    fun renderThumbnail_paintsTheFilledCells() {
        val thumb = PictoLinkEngine.renderThumbnail(docPuzzle, PictoLinkEngine.extractAnswer(docPuzzle, solved))!!
        assertEquals(5, thumb.width)
        assertEquals(5, thumb.height)
        val black = 0xFF000000.toInt()
        val filled = thumb.cells.indices.filter { thumb.cells[it] == black }.map { it / 5 to it % 5 }
        assertEquals(listOf(0 to 0, 0 to 4, 1 to 0, 2 to 1, 2 to 2, 2 to 3, 2 to 4), filled)
    }

    @Test
    fun isRegistered() {
        assertTrue(PuzzleEngines.forType(27) === PictoLinkEngine)
    }
}
