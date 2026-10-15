package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ShadeCycleTest {

    private fun puzzle(type: Int, canonJson: String): Puzzle = Puzzle(
        id = "s1",
        puzzleType = type,
        puzzleTypeName = "shade",
        puzzleTypeJpLabel = "shade",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // -- next -----------------------------------------------------------------

    @Test
    fun next_cyclesEmptyShadedMarked() {
        assertEquals(ShadeCycle.SHADED, ShadeCycle.next(ShadeCycle.EMPTY))
        assertEquals(ShadeCycle.MARKED, ShadeCycle.next(ShadeCycle.SHADED))
        assertEquals(ShadeCycle.EMPTY, ShadeCycle.next(ShadeCycle.MARKED))
    }

    @Test
    fun next_skipsShadedWhenBarred() {
        assertEquals(ShadeCycle.MARKED, ShadeCycle.next(ShadeCycle.EMPTY, canShade = false))
        assertEquals(ShadeCycle.EMPTY, ShadeCycle.next(ShadeCycle.MARKED, canShade = false))
    }

    // -- every onboarded shade/mark puzzle uses the shared rule ----------------

    @Test
    fun registry_shadeMarkPuzzlesImplementTheSharedInterface() {
        // LITS 15, Nurikabe 24, Nuritwin 9, Nurimaze 3.
        for (type in listOf(15, 24, 9, 3)) {
            assertTrue("type $type", PuzzleEngines.forType(type) is ShadeMarkEngine)
        }
    }

    @Test
    fun engineStatesMatchTheSharedValues() {
        assertEquals(ShadeCycle.SHADED, LitsEngine.SHADED)
        assertEquals(ShadeCycle.SHADED, NurikabeEngine.BLACK)
        assertEquals(ShadeCycle.SHADED, NuritwinEngine.BLACK)
        assertEquals(ShadeCycle.SHADED, NurimazeEngine.BLACK)
        assertEquals(ShadeCycle.MARKED, LitsEngine.MARKED)
        assertEquals(ShadeCycle.MARKED, NurikabeEngine.MARKED)
        assertEquals(ShadeCycle.MARKED, NuritwinEngine.MARKED)
        assertEquals(ShadeCycle.MARKED, NurimazeEngine.MARKED)
    }

    // -- tap --------------------------------------------------------------------

    @Test
    fun tap_lits_cyclesTheTappedCellUnderItsOwnKey() {
        val p = puzzle(15, """{"grids":{"h":[[0,0]],"v":[[0],[0]]}}""")
        assertEquals(mapOf("c:1,0" to 1), ShadeCycle.tap(LitsEngine, p, emptyMap(), 1, 0))
        assertEquals(mapOf("c:1,0" to 2), ShadeCycle.tap(LitsEngine, p, mapOf("c:1,0" to 1), 1, 0))
        assertEquals(mapOf("c:1,0" to 0), ShadeCycle.tap(LitsEngine, p, mapOf("c:1,0" to 2), 1, 0))
    }

    @Test
    fun tap_nurikabe_ignoresClueCells() {
        val p = puzzle(24, """{"cells":[[1,0],[0,0]]}""")
        assertEquals(emptyMap<String, Int>(), ShadeCycle.tap(NurikabeEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("1,0" to 1), ShadeCycle.tap(NurikabeEngine, p, emptyMap(), 1, 0))
    }

    @Test
    fun tap_nuritwin_cyclesSingleCellsIncludingClues() {
        // 1x2, one room, a clue in (0,0): Nuritwin clues are room sizes, so still tappable.
        val p = puzzle(9, """{"cells":[[2,0]],"grids":{"h":[],"v":[[0]]}}""")
        assertEquals(mapOf("0,0" to 1), ShadeCycle.tap(NuritwinEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("1,0" to 2), ShadeCycle.tap(NuritwinEngine, p, mapOf("1,0" to 1), 1, 0))
    }
}
