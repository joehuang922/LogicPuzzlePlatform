package com.puzzleplatform.player.puzzle

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** Mirrors the web's titleNormalize.test.ts. */
class TitleNormalizeTest {

    private fun items(titles: List<String?>, type: Int = 1) =
        titles.mapIndexed { i, t -> TitleNormalize.Item("$type-$i", type, t) }

    @Test
    fun parse_splitsAtFirstNumber() {
        assertEquals(TitleNormalize.Parsed("Q", 12, ". ", "Name 3"), TitleNormalize.parse("Q12. Name 3"))
        assertEquals(TitleNormalize.Parsed("", 7, "", ""), TitleNormalize.parse("7"))
        assertEquals(TitleNormalize.Parsed("第", 12, "", "問"), TitleNormalize.parse("第１２問"))
        assertNull(TitleNormalize.parse("special"))
        assertNull(TitleNormalize.parse(null))
    }

    @Test
    fun patternError_needsExactlyOneNumber() {
        assertNull(TitleNormalize.patternError("<number>"))
        assertNull(TitleNormalize.patternError("Q<number>. <text>"))
        assertNotNull(TitleNormalize.patternError("Q"))
        assertNotNull(TitleNormalize.patternError("<number><number>"))
        assertNotNull(TitleNormalize.patternError("<number><text><text>"))
    }

    @Test
    fun suggestPattern_picksMostCommonShape() {
        assertEquals("<number>", TitleNormalize.suggestPattern(listOf("1", "2", "3", "10")))
        assertEquals(
            "Q<number>. <text>",
            TitleNormalize.suggestPattern(listOf("Q1. A", "2 B", "3 C", "Q4. D", "Q5. E", "special")),
        )
        assertEquals("<number>", TitleNormalize.suggestPattern(listOf("special", null)))
    }

    @Test
    fun normalize_padsPlainNumbers() {
        val out = TitleNormalize.normalize(items((1..15).map { "$it" }), "<number>").map { it.newTitle }
        assertEquals(listOf("01", "02", "03"), out.take(3))
        assertEquals(listOf("10", "11", "12", "13", "14", "15"), out.drop(9))
    }

    @Test
    fun normalize_rewritesToPatternAndLeavesUnnumbered() {
        val out = TitleNormalize.normalize(
            items(listOf("Q1. A", "2 B", "3 C", "Q4. D", "Q26. Z", "special")),
            "Q<number>. <text>",
        )
        assertEquals(listOf("Q01. A", "Q02. B", "Q03. C", "Q04. D", "Q26. Z", "special"), out.map { it.newTitle })
        assertFalse(out.any { it.conflict })
    }

    @Test
    fun normalize_rePadsToWidest() {
        assertEquals(
            listOf("07", "12"),
            TitleNormalize.normalize(items(listOf("007", "12")), "<number>").map { it.newTitle },
        )
    }

    @Test
    fun normalize_flagsConflictsWithinTypeOnly() {
        val out = TitleNormalize.normalize(items(listOf("1", "01", "2"), 1) + items(listOf("1"), 2), "<number>")
        assertEquals(
            listOf("1" to true, "1" to true, "2" to false, "1" to false),
            out.map { it.newTitle to it.conflict },
        )
    }

    @Test
    fun normalize_ignoresDuplicatesItDidNotCreate() {
        val out = TitleNormalize.normalize(items(listOf("special", "special", "3")), "<number>")
        assertFalse(out.any { it.conflict })
    }
}
