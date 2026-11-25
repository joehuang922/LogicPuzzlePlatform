package com.puzzleplatform.player.puzzle

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * [AuthoringType.jpLabel] is predefined in the app; this keeps it in step with the
 * server's `jp_label` seed so the Android dropdown matches the web admin's.
 */
class AuthoringTypeTest {

    private val row = Regex("""\(\s*(\d+)\s*,\s*'[^']*'\s*,\s*'([^']*)'""")

    @Test
    fun `japanese labels match the server seed`() {
        // Unit tests run from the app module directory.
        val seed = File("../../api/seed.sql").readText()
        val jpLabels = row.findAll(seed).associate { it.groupValues[1].toInt() to it.groupValues[2] }
        for (t in AuthoringType.entries) {
            assertEquals("jp label for $t", jpLabels[t.puzzleType], t.jpLabel)
        }
    }

    @Test
    fun `incubating flags match the server seed`() {
        val seed = File("../../api/seed.sql").readText()
        val incubating = Regex("""UPDATE puzzle_types SET incubating = 1 WHERE id IN \(([^)]*)\)""")
            .findAll(seed)
            .flatMap { m -> m.groupValues[1].split(",").map { it.trim().toInt() } }
            .toSet()
        for (t in AuthoringType.entries) {
            assertEquals("incubating for $t", t.puzzleType in incubating, t.incubating)
        }
        // Incubating types come last in the dropdown.
        val ordered = AuthoringType.ordered
        assertEquals(ordered.sortedBy { it.incubating }, ordered)
        assertEquals(
            listOf(
                AuthoringType.WHIMSICAL_KNIGHT, AuthoringType.OMINO_TREE, AuthoringType.MINUS_ROOM,
                AuthoringType.PERFECT_L_RING, AuthoringType.MANNEQUIN_GATE_2, AuthoringType.YAJILIX,
                AuthoringType.MAJORITY_YAJILIX, AuthoringType.MELON_PIE,
            ),
            ordered.takeLast(8),
        )
    }
}
