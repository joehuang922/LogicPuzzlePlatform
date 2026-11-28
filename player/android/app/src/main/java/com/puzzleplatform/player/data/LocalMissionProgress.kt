package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.model.Mission
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Mission progress counted from the device's own attempts, so a solve shows on
 * the Profile at once, before (or without) its sync reaching the server. It
 * mirrors evaluateMission in player/api/src/lib/missions.ts: a solve is the
 * first finish of a distinct question inside the mission's window.
 *
 * The local count only adds to what the server reported (it never lowers it),
 * so a mission completed locally may later read as not completed if that
 * finish never syncs — an accepted trade-off.
 */
object LocalMissionProgress {
    private const val HARD = 4

    /** A local finish: [finishedAt] is a UTC "YYYY-MM-DD HH:MM:SS"; type/difficulty null if the puzzle isn't cached. */
    data class Finish(
        val question: String,
        val typeId: Int?,
        val difficulty: Int?,
        val finishedAt: String,
    )

    private val sqlFormat: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC)

    /** ISO instant ("2026-11-26T16:00:00Z") -> UTC SQL datetime, the format local finishes use. */
    fun toSqlDateTime(iso: String): String? =
        runCatching { sqlFormat.format(Instant.parse(iso)) }.getOrNull()

    private fun toIso(sql: String): String = sql.replace(' ', 'T') + "Z"

    private fun counts(m: Mission, f: Finish): Boolean = when (m.kind) {
        "solve_count" -> true
        "solve_type" -> f.typeId != null && f.typeId == m.typeId
        "solve_hard" -> (f.difficulty ?: 0) >= HARD
        "solve_assigned" -> f.question == m.questionId
        else -> false
    }

    /**
     * [m] with local finishes and puzzle progress merged in. [latestProgress] is the
     * latest local snapshot's progress (0..1) per question.
     */
    fun apply(m: Mission, finishes: List<Finish>, latestProgress: Map<String, Double>): Mission {
        val start = toSqlDateTime(m.startsAt) ?: return m
        val end = toSqlDateTime(m.endsAt) ?: return m

        // First finish of each question inside the window, oldest first.
        val firsts = finishes
            .filter { it.finishedAt >= start && it.finishedAt < end }
            .groupBy { it.question }
            .map { (_, fs) -> fs.minBy { it.finishedAt } }
            .sortedBy { it.finishedAt }

        var count = 0
        var reachedAt: String? = null
        for (f in firsts) {
            if (counts(m, f)) count++
            if (reachedAt == null && count >= m.target) reachedAt = f.finishedAt
        }

        val completed = m.completed || reachedAt != null
        val progress = if (completed) m.target else maxOf(m.progress, minOf(count, m.target))
        val puzzleProgress = when {
            m.puzzleProgress == null && m.kind != "solve_assigned" -> null
            completed -> 1.0
            else -> maxOf(
                m.puzzleProgress ?: 0.0,
                (m.questionId?.let { latestProgress[it] } ?: 0.0).coerceIn(0.0, 1.0),
            )
        }
        return m.copy(
            progress = progress,
            puzzleProgress = puzzleProgress,
            completed = completed,
            completedAt = m.completedAt ?: reachedAt?.let(::toIso),
            refreshable = m.refreshable && !completed,
        )
    }
}
