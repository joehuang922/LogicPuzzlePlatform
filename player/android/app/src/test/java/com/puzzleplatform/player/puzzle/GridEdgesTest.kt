package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.TentaishowEngine.Dot
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * Adding and removing a line at the top / left of every editor that offers it: adding then
 * removing the same line gives the draft back, and what the board holds moves with it.
 */
class GridEdgesTest {

    private fun doc(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/$path.canon.json").readText()) as JsonObject

    private fun json(s: String) = Json.parseToJsonElement(s) as JsonObject

    /** Resize-only types: add then remove at each of the four edges. */
    private fun <D> edgesRoundTrip(
        d: D,
        addRow: (D, Boolean) -> D,
        addCol: (D, Boolean) -> D,
        removeRow: (D, Boolean) -> D,
        removeCol: (D, Boolean) -> D,
    ) {
        for (start in listOf(true, false)) {
            assertEquals("row, top=$start", d, removeRow(addRow(d, start), start))
            assertEquals("col, left=$start", d, removeCol(addCol(d, start), start))
        }
    }

    /** Index-based types: add at the top / left, delete line 0. */
    private fun <D> frontRoundTrip(
        d: D,
        addRow: (D, Boolean) -> D,
        addCol: (D, Boolean) -> D,
        removeRow: (D, Int) -> D,
        removeCol: (D, Int) -> D,
    ) {
        assertEquals("row", d, removeRow(addRow(d, true), 0))
        assertEquals("col", d, removeCol(addCol(d, true), 0))
    }

    @Test
    fun grids() {
        val g = listOf(listOf(1, 2), listOf(3, 4))
        assertEquals(listOf(listOf(0, 0), listOf(1, 2), listOf(3, 4)), g.plusEdgeRow(true, 2, 0))
        assertEquals(listOf(listOf(1, 2, 0), listOf(3, 4, 0)), g.plusEdgeCol(false, 0))
        assertEquals(listOf(listOf(2), listOf(4)), g.minusEdgeCol(true))
        assertEquals(listOf(listOf(0, 0, 0), listOf(0, 1, 2), listOf(0, 3, 4)), g.shifted(1, 1, 2, 0))
        assertEquals(listOf(listOf(4)), g.shifted(-1, -1, 2, 0))
    }

    // ---- resize-only types --------------------------------------------------------------

    @Test
    fun countryRoad_newTopRowIsWalledOff() {
        val d = CountryRoadAuthoring.draftFromCanon(doc("country-road/board-country-road-2"))
        val A = CountryRoadAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        val taller = A.addRow(d, top = true)
        assertEquals(d.cells, taller.cells.drop(1))
        assertEquals(List(d.cols) { 1 }, taller.h.first())
        assertEquals(List(d.cols - 1) { 0 }, taller.v.first())
        val wider = A.addCol(d, left = true)
        assertEquals(List(d.rows) { 1 }, wider.v.map { it.first() })
    }

    @Test
    fun minusRoom() {
        val d = MinusRoomAuthoring.draftFromCanon(doc("minus-room/board-minus-room-1"))
        val A = MinusRoomAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        assertEquals(d.circles.map { it.dr + 2 }, A.addRow(d, top = true).circles.map { it.dr })
    }

    @Test
    fun zebraRope() {
        val d = ZebraRopeAuthoring.draftFromCanon(doc("zebra-rope/board-zebra-rope-1"))
        val A = ZebraRopeAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        val wider = A.addCol(d, left = true)
        assertEquals(d.ropes.map { r -> r.map { (y, x) -> y to x + 1 } }, wider.ropes)
        assertEquals(d.circles.map { it.dc + 2 }, wider.circles.map { it.dc })
    }

    @Test
    fun ominoTree() {
        val d = OminoTreeAuthoring.draftFromCanon(doc("omino-tree/board-omino-tree-1"))
        val A = OminoTreeAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        assertEquals(d.arrows.map { it.r + 1 }, A.addRow(d, top = true).arrows.map { it.r })
    }

    @Test
    fun whimsicalKnight() {
        val d = WhimsicalKnightAuthoring.draftFromCanon(doc("whimsical-knight/board-whimsical-knight-2"))
        val A = WhimsicalKnightAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        val taller = A.addRow(d, top = true)
        assertEquals(d.gray, taller.gray.drop(1))
        assertEquals(d.circles.map { it.dr + 2 }, taller.circles.map { it.dr })
    }

    @Test
    fun mannequinGate2() {
        val d = MannequinGate2Authoring.draftFromCanon(doc("mannequin-gate-2/mannequin-gate-2-board-1"))
        val A = MannequinGate2Authoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        assertEquals(d.lines.map { l -> l.map { (r, c) -> r to c + 1 } }, A.addCol(d, left = true).lines)
    }

    @Test
    fun sinkamino() {
        val d = SinkaminoAuthoring.draftFromCanon(doc("sinkamino/sinkamino-board-1"))
        val A = SinkaminoAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        // A trail through the removed row goes with it; the rest move up.
        val small = A.draftFromCanon(json("""{"cells":[[2,0,0],[0,1,0]],"arrows":[[[0,0],[0,1]],[[1,1],[1,2]]]}"""))
        assertEquals(listOf(listOf(0 to 1, 0 to 2)), A.removeEdgeRow(small, top = true).arrows)
    }

    @Test
    fun tentaishow() {
        val d = TentaishowAuthoring.draftFromCanon(doc("tentaishow/board-tentaishow-medium"))
        val A = TentaishowAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        // A dot on the removed column's centres goes; one on its far edge becomes a border point and goes too.
        val small = A.draftFromCanon(json("""{"width":3,"height":2,"dots":[{"dr":1,"dc":1,"color":0},{"dr":2,"dc":4,"color":1}]}"""))
        assertEquals(listOf(Dot(2, 2, 1)), A.removeEdgeCol(small, left = true).dots)
    }

    @Test
    fun kuralin() {
        val d = KuralinAuthoring.draftFromCanon(doc("kuralin/kuralin-small"))
        val A = KuralinAuthoring
        edgesRoundTrip(d, A::addRow, A::addCol, A::removeEdgeRow, A::removeEdgeCol)
        assertEquals(d.circles.map { it.dr + 2 }, A.addRow(d, top = true).circles.map { it.dr })
    }

    // ---- index-based types --------------------------------------------------------------

    @Test
    fun plainCellGrids() {
        val ints = listOf(listOf(1, 0, 2), listOf(0, 3, 0))
        NurikabeAuthoring.let { A -> frontRoundTrip(NurikabeDraft(ints), A::addRow, A::addCol, A::removeRow, A::removeCol) }
        PictoLinkAuthoring.let { A -> frontRoundTrip(PictoLinkDraft(ints), A::addRow, A::addCol, A::removeRow, A::removeCol) }
        SlitherlinkAuthoring.let { A -> frontRoundTrip(SlitherlinkDraft(ints), A::addRow, A::addCol, A::removeRow, A::removeCol) }
        MasyuAuthoring.let { A -> frontRoundTrip(MasyuDraft(ints), A::addRow, A::addCol, A::removeRow, A::removeCol) }
        HashiAuthoring.let { A -> frontRoundTrip(ClueGridDraft(ints), A::addRow, A::addCol, A::removeRow, A::removeCol) }
        val top = HashiAuthoring.addRow(ClueGridDraft(ints), top = true)
        assertEquals(listOf(0, 0, 0), top.cells.first())
        assertEquals(ints, top.cells.drop(1))
    }

    @Test
    fun nonogram() {
        val d = NonogramDraft(listOf(listOf(1), listOf(2)), listOf(listOf(1, 1), listOf(0)))
        val A = NonogramAuthoring
        frontRoundTrip(d, A::addRow, A::addCol, A::removeRow, A::removeCol)
        assertEquals(listOf(listOf(0), listOf(1), listOf(2)), A.addRow(d, top = true).rowClues)
    }

    @Test
    fun slalom_numbersAndStartMove() {
        val d = SlalomAuthoring.draftFromCanon(json(
            """{"cells":[[0,1,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,1]],
                "start":{"row":2,"col":0},"gateCount":2,
                "gates":[{"orientation":"h","line":0,"from":2,"to":3,"number":1},
                         {"orientation":"v","line":4,"from":0,"to":2}]}""",
        ))
        val A = SlalomAuthoring
        frontRoundTrip(d, A::addRow, A::addCol, A::removeRow, A::removeCol)
        val taller = A.addRow(d, top = true)
        assertEquals(3 to 0, taller.start)
        assertEquals(d.numbers.keys.map { it.first + 1 to it.second }.toSet(), taller.numbers.keys)
    }

    @Test
    fun skeleton_marksMove() {
        val d = SkeletonPuzzleAuthoring.draftFromCanon(doc("skeleton-puzzle/skeleton-puzzle-board-1"))
        val A = SkeletonPuzzleAuthoring
        frontRoundTrip(d, A::addRow, A::addCol, A::removeRow, A::removeCol)
        assertEquals(d.marks.map { it.c + 1 }, A.addCol(d, left = true).marks.map { it.c })
    }

    @Test
    fun rooms_newTopRowIsOneRoomAndCluesMove() {
        val r = RippleEffectAuthoring.draftFromCanon(doc("ripple-effect/board-ripple-effect"))
        RippleEffectAuthoring.let { A -> frontRoundTrip(r, A::addRow, A::addCol, A::removeRow, A::removeCol) }
        val taller = RippleEffectAuthoring.addRow(r, top = true)
        assertEquals(List(r.width) { true }, taller.hWalls.first())
        assertEquals(r.clues.keys.map { it.first + 1 to it.second }.toSet(), taller.clues.keys)

        val h = HeyawakeDraft(
            width = 3,
            height = 2,
            hWalls = listOf(listOf(true, true, true)),
            vWalls = listOf(listOf(false, true), listOf(false, true)),
            clues = mapOf((0 to 0) to 1, (1 to 2) to 0),
        )
        HeyawakeAuthoring.let { A -> frontRoundTrip(h, A::addRow, A::addCol, A::removeRow, A::removeCol) }
        assertEquals(setOf((0 to 1) to 1, (1 to 3) to 0), HeyawakeAuthoring.addCol(h, left = true).clues.toList().toSet())
    }
}
