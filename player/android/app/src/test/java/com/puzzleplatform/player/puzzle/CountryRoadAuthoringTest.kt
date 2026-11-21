package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CountryRoadAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/country-road/$name.canon.json").readText()) as JsonObject

    private val example = CountryRoadAuthoring.draftFromCanon(sample("board-country-road-example"))

    @Test
    fun samplesRoundTripThroughTheDraft() {
        for ((name, size) in listOf("board-country-road-example" to 3, "board-country-road" to 10,
            "board-country-road-2" to 10, "board-country-road-3" to 10)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.COUNTRY_ROAD, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.COUNTRY_ROAD))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.COUNTRY_ROAD))
        }
    }

    @Test
    fun edits() {
        var d = CountryRoadAuthoring.setNumber(example, 0, 2, 1)
        assertEquals(1, d.number(0, 2))
        d = CountryRoadAuthoring.setNumber(d, 0, 2, null)
        assertEquals(0, d.number(0, 2))
        d = CountryRoadAuthoring.toggleWall(example, "v:0,0")
        assertEquals(1, d.v[0][0])
        assertEquals(example, CountryRoadAuthoring.toggleWall(d, "v:0,0"))
        assertEquals(example, CountryRoadAuthoring.toggleWall(example, "h:2,0")) // off the grid
        assertEquals(5, CountryRoadAuthoring.parseNumber("5"))
        assertNull(CountryRoadAuthoring.parseNumber("0"))
        assertNull(CountryRoadAuthoring.parseNumber(""))
    }

    @Test
    fun rowsAndColumns() {
        val wider = CountryRoadAuthoring.addCol(example)
        assertEquals(4, wider.cols)
        assertTrue(wider.wallRight(0, 2) && wider.wallRight(2, 2)) // the new column is walled off
        assertEquals(0, wider.h[0][3]) // and its cells join each other
        assertEquals(example, CountryRoadAuthoring.removeLastCol(wider))
        val taller = CountryRoadAuthoring.addRow(example)
        assertEquals(example, CountryRoadAuthoring.removeLastRow(taller))
    }

    @Test
    fun formatProblemsAndWarnings() {
        assertEquals(emptyList<String>(), CountryRoadAuthoring.problems(example))
        val two = CountryRoadAuthoring.setNumber(example, 1, 1, 2)
        assertEquals(listOf("Two numbers in one room (R1C1 and R2C2)"), CountryRoadAuthoring.formatProblems(two))
        val dangling = CountryRoadAuthoring.toggleWall(example, "v:0,0")
        assertEquals(listOf("Wall at R1C1 doesn't close off a room"), CountryRoadAuthoring.formatProblems(dangling))
        val big = CountryRoadAuthoring.setNumber(example, 0, 2, 2)
        assertEquals(emptyList<String>(), CountryRoadAuthoring.formatProblems(big))
        assertEquals(listOf("Number 2 at R1C3 is more than its room's 1 cells"), CountryRoadAuthoring.problems(big))
    }

    @Test
    fun typeIsListed() {
        assertEquals(AuthoringType.COUNTRY_ROAD, AuthoringType.forPuzzleType(41))
    }
}
