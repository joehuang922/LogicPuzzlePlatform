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
}
