package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.PuzzleResponse
import com.puzzleplatform.player.data.model.Snapshot
import com.puzzleplatform.player.data.model.SnapshotResponse
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

/**
 * Guards the two backend data quirks the app must tolerate:
 *  - MySQL BOOLEAN over the RDS Data API arrives as 0/1 (or a real bool).
 *  - Snapshot.currentAnswer is a stringified JSON blob, not a nested object.
 */
class ModelsDeserializationTest {

    // Same config as ServiceLocator.json so tests exercise the real settings.
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
    }

    private fun puzzleJson(special: String): String = """
        {
          "puzzle": {
            "id": "abc",
            "puzzleType": 1,
            "puzzleTypeName": "sudoku",
            "puzzleTypeJpLabel": "数独",
            "difficulty": 3,
            "canonRepr": { "hints": [[0,0,0]] },
            "special": $special
          }
        }
    """.trimIndent()

    @Test
    fun special_acceptsIntegerOne() {
        val p = json.decodeFromString<PuzzleResponse>(puzzleJson("1")).puzzle
        assertTrue(p.special)
    }

    @Test
    fun special_acceptsIntegerZero() {
        val p = json.decodeFromString<PuzzleResponse>(puzzleJson("0")).puzzle
        assertFalse(p.special)
    }

    @Test
    fun special_acceptsRealBoolean() {
        assertTrue(json.decodeFromString<PuzzleResponse>(puzzleJson("true")).puzzle.special)
        assertFalse(json.decodeFromString<PuzzleResponse>(puzzleJson("false")).puzzle.special)
    }

    @Test
    fun special_acceptsNumericString() {
        assertTrue(json.decodeFromString<PuzzleResponse>(puzzleJson("\"1\"")).puzzle.special)
        assertFalse(json.decodeFromString<PuzzleResponse>(puzzleJson("\"0\"")).puzzle.special)
    }

    @Test
    fun special_defaultsFalseWhenAbsent() {
        val raw = """
            {
              "puzzle": {
                "id": "abc",
                "puzzleType": 1,
                "puzzleTypeName": "sudoku",
                "puzzleTypeJpLabel": "数独",
                "difficulty": 3,
                "canonRepr": {}
              }
            }
        """.trimIndent()
        assertFalse(json.decodeFromString<PuzzleResponse>(raw).puzzle.special)
    }

    @Test
    fun canonRepr_isPreservedAsJsonObject() {
        val p = json.decodeFromString<PuzzleResponse>(puzzleJson("0")).puzzle
        val hints = (p.canonRepr["hints"] as JsonArray)[0].jsonArray
        assertEquals(3, hints.size)
        assertEquals(0, hints[0].jsonPrimitive.int)
    }

    @Test
    fun canonRepr_acceptsStringifiedJsonFromTheApi() {
        // The API stores canon_repr stringified and passes it through untouched,
        // so it arrives as a JSON *string*, not a nested object. Must still parse.
        val raw = """
            {
              "puzzle": {
                "id": "abc",
                "puzzleType": 1,
                "puzzleTypeName": "sudoku",
                "puzzleTypeJpLabel": "数独",
                "difficulty": 3,
                "canonRepr": "{\"hints\":[[1,2,3]]}",
                "special": 0
              }
            }
        """.trimIndent()
        val p = json.decodeFromString<PuzzleResponse>(raw).puzzle
        val hints = (p.canonRepr["hints"] as JsonArray)[0].jsonArray
        assertEquals(2, hints[1].jsonPrimitive.int)
    }

    @Test
    fun snapshot_currentAnswerStaysAStringAndParsesOnDemand() {
        // currentAnswer is a JSON string containing escaped JSON.
        val raw = """
            {
              "snapshot": {
                "id": "s1",
                "attempt": "a1",
                "currentAnswer": "{\"hints\":[[1,2,3]]}",
                "progress": 0.5,
                "elapsedSeconds": 42,
                "finished": 1,
                "createdAt": "2026-01-01T00:00:00Z"
              }
            }
        """.trimIndent()
        val snap: Snapshot = json.decodeFromString<SnapshotResponse>(raw).snapshot

        assertEquals("{\"hints\":[[1,2,3]]}", snap.currentAnswer)
        assertEquals(42, snap.elapsedSeconds)
        assertTrue(snap.finished) // 1 -> true via FlexibleBooleanSerializer

        // The repository parses that string into a JsonObject on demand.
        val parsed = json.parseToJsonElement(snap.currentAnswer) as JsonObject
        val hints = (parsed["hints"] as JsonArray)[0].jsonArray
        assertEquals(2, hints[1].jsonPrimitive.int)
    }

    @Test
    fun ignoresUnknownServerFields() {
        val raw = """
            {
              "puzzle": {
                "id": "abc",
                "puzzleType": 1,
                "puzzleTypeName": "sudoku",
                "puzzleTypeJpLabel": "数独",
                "difficulty": 3,
                "canonRepr": {},
                "special": 0,
                "someFutureField": "ignored"
              }
            }
        """.trimIndent()
        val p: Puzzle = json.decodeFromString<PuzzleResponse>(raw).puzzle
        assertEquals("abc", p.id)
    }
}
