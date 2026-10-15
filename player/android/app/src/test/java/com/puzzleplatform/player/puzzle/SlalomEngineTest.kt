package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SlalomEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "s1",
        puzzleType = 10,
        puzzleTypeName = "slalom",
        puzzleTypeJpLabel = "Slalom",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3 rows x 4 cols, walls at (1,1) and (1,2), start (0,0), three one-cell gates:
    //   A: vertical at col 2, row 0     (crossed by the step (0,1)->(0,2))
    //   B: horizontal at row 1, col 3   (crossed by the step (0,3)->(1,3))
    //   C: vertical at col 1, row 2     (crossed by the step (2,2)->(2,1))
    private fun canon(a: String = "1", b: String = "2", c: String = "null") = """{
        "cells": [[0,0,0,0],[0,1,1,0],[0,0,0,0]],
        "start": {"row": 0, "col": 0},
        "gateCount": 3,
        "gates": [
          {"orientation": "v", "line": 2, "from": 0, "to": 0, "number": $a},
          {"orientation": "h", "line": 1, "from": 3, "to": 3, "number": $b},
          {"orientation": "v", "line": 1, "from": 2, "to": 2, "number": $c}
        ]}"""

    // The ring around the walls: (0,0)->(0,3)->(2,3)->(2,0)->(0,0).
    private val ring = mapOf(
        "h:0,0" to 1, "h:0,1" to 1, "h:0,2" to 1, "v:0,3" to 1, "v:1,3" to 1,
        "h:2,2" to 1, "h:2,1" to 1, "h:2,0" to 1, "v:1,0" to 1, "v:0,0" to 1,
    )

    @Test
    fun parse_readsGatesAndStart() {
        val c = SlalomEngine.parse(puzzle(canon()))
        assertEquals(3, c.rows)
        assertEquals(4, c.cols)
        assertEquals(3, c.gateCount)
        assertEquals(SlalomEngine.Gate(vertical = true, line = 2, from = 0, to = 0, number = 1), c.gates[0])
        assertEquals(null, c.gates[2].number)
        assertTrue(c.isWall(1, 1))
    }

    @Test
    fun isComplete_acceptsLoopCrossingGatesInOrder() {
        assertTrue(SlalomEngine.isComplete(puzzle(canon()), ring))
    }

    @Test
    fun isComplete_acceptsOrderInTheOtherDirection() {
        // Numbered so the order only works walking the loop anticlockwise: C, B, A.
        assertTrue(SlalomEngine.isComplete(puzzle(canon(a = "null", b = "2", c = "1")), ring))
    }

    @Test
    fun isComplete_rejectsWrongOrder() {
        assertFalse(SlalomEngine.isComplete(puzzle(canon(a = "2", b = "1")), ring))
    }

    @Test
    fun isComplete_rejectsOpenTrail() {
        assertFalse(SlalomEngine.isComplete(puzzle(canon()), ring - "h:2,1"))
    }

    @Test
    fun isComplete_rejectsASecondLoop() {
        // A separate 2x2 loop off to the side of a wider board.
        val wide = """{
            "cells": [[0,0,0,0,0,0],[0,1,1,0,0,0],[0,0,0,0,0,0]],
            "start": {"row": 0, "col": 0}, "gateCount": 1,
            "gates": [{"orientation": "v", "line": 2, "from": 0, "to": 0, "number": null}]}"""
        val outer = mapOf(
            "h:0,0" to 1, "h:0,1" to 1, "h:0,2" to 1, "v:0,3" to 1, "v:1,3" to 1,
            "h:2,2" to 1, "h:2,1" to 1, "h:2,0" to 1, "v:1,0" to 1, "v:0,0" to 1,
        )
        assertTrue(SlalomEngine.isComplete(puzzle(wide), outer))
        val extra = mapOf("h:0,4" to 1, "v:0,4" to 1, "v:0,5" to 1, "h:1,4" to 1)
        assertFalse(SlalomEngine.isComplete(puzzle(wide), outer + extra))
    }

    @Test
    fun computeProgress_countsCrossedGates() {
        val p = puzzle(canon())
        assertEquals(0.0, SlalomEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(100.0 / 3, SlalomEngine.computeProgress(p, mapOf("h:0,1" to 1)), 1e-9)
        assertEquals(100.0, SlalomEngine.computeProgress(p, ring), 1e-9)
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val p = puzzle(canon())
        val answer = SlalomEngine.extractAnswer(p, ring)
        val trail = answer["trail"]!!.jsonObject
        assertEquals(3, trail["h"]!!.jsonArray.size)
        assertEquals(listOf(1, 1, 1), trail["h"]!!.jsonArray[0].jsonArray.map { it.jsonPrimitive.int })
        assertEquals(2, trail["v"]!!.jsonArray.size)
        assertEquals(ring, SlalomEngine.restoreUserValues(p, answer))
    }

    @Test
    fun canDraw_refusesWallsBranchesAndRunningAlongAGate() {
        val p = puzzle("""{
            "cells": [[0,0,0],[0,0,1]], "start": {"row": 0, "col": 0}, "gateCount": 1,
            "gates": [{"orientation": "v", "line": 1, "from": 0, "to": 1, "number": null}]}""")
        val c = SlalomEngine.parse(p)
        val empty = SlalomEngine.trail(2, 3, emptyMap())
        assertTrue(SlalomEngine.canDraw(c, empty, 0 to 0, 0 to 1)) // across the gate
        assertFalse(SlalomEngine.canDraw(c, empty, 0 to 1, 1 to 1)) // along the gate
        assertFalse(SlalomEngine.canDraw(c, empty, 1 to 1, 1 to 2)) // into a wall
        val corner = SlalomEngine.trail(2, 3, mapOf("h:0,0" to 1, "v:0,0" to 1))
        assertFalse(SlalomEngine.canDraw(c, corner, 0 to 0, 0 to 1)) // (0,0) already has two
    }
}
