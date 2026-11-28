package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.LocalMissionProgress.Finish
import com.puzzleplatform.player.data.model.Mission
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalMissionProgressTest {
    private fun mission(kind: String, target: Int = 1, typeId: Int? = null, questionId: String? = null) = Mission(
        id = 1,
        period = "day",
        periodStart = "2026-11-27",
        startsAt = "2026-11-26T16:00:00Z",
        endsAt = "2026-11-27T16:00:00Z",
        kind = kind,
        typeId = typeId,
        description = "",
        questionId = questionId,
        progress = 0,
        target = target,
        puzzleProgress = if (kind == "solve_assigned") 0.0 else null,
        refreshable = true,
    )

    private val finishes = listOf(
        Finish("a", 3, 2, "2026-11-26 15:59:59"), // before the window
        Finish("b", 3, 4, "2026-11-26 17:00:00"),
        Finish("b", 3, 4, "2026-11-26 18:00:00"), // same question again
        Finish("c", 5, 1, "2026-11-27 01:00:00"),
        Finish("d", null, null, "2026-11-27 16:00:00"), // window end is exclusive
    )

    @Test
    fun countsDistinctQuestionsInsideTheWindow() {
        val m = LocalMissionProgress.apply(mission("solve_count", target = 3), finishes, emptyMap())
        assertEquals(2, m.progress)
        assertFalse(m.completed)
        assertTrue(m.refreshable)
    }

    @Test
    fun completesATypeMissionAtTheSolveThatReachedIt() {
        val m = LocalMissionProgress.apply(mission("solve_type", typeId = 5), finishes, emptyMap())
        assertTrue(m.completed)
        assertEquals(1, m.progress)
        assertEquals("2026-11-27T01:00:00Z", m.completedAt)
        assertFalse(m.refreshable)
    }

    @Test
    fun hardMissionNeedsDifficultyFour() {
        val m = LocalMissionProgress.apply(mission("solve_hard", target = 2), finishes, emptyMap())
        assertEquals(1, m.progress)
    }

    @Test
    fun assignedPuzzleTakesLocalSnapshotProgress() {
        val open = LocalMissionProgress.apply(mission("solve_assigned", questionId = "z"), finishes, mapOf("z" to 0.4))
        assertEquals(0.4, open.puzzleProgress!!, 1e-9)
        val done = LocalMissionProgress.apply(mission("solve_assigned", questionId = "c"), finishes, mapOf("c" to 0.9))
        assertTrue(done.completed)
        assertEquals(1.0, done.puzzleProgress!!, 1e-9)
    }

    @Test
    fun neverLowersWhatTheServerReported() {
        val server = mission("solve_count", target = 20).copy(progress = 7)
        assertEquals(7, LocalMissionProgress.apply(server, finishes, emptyMap()).progress)
        val serverDone = mission("solve_type", typeId = 99).copy(completed = true, progress = 1, refreshable = false)
        assertTrue(LocalMissionProgress.apply(serverDone, emptyList(), emptyMap()).completed)
    }
}
