package com.puzzleplatform.player.data

import android.content.Context
import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.local.AppDatabase
import com.puzzleplatform.player.data.local.AttemptEntity
import com.puzzleplatform.player.data.local.SnapshotEntity
import com.puzzleplatform.player.data.local.toEntity
import com.puzzleplatform.player.data.local.toModel
import com.puzzleplatform.player.data.local.toSummary
import com.puzzleplatform.player.data.model.Attempt
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CollectionProgress
import com.puzzleplatform.player.data.model.CreateAttemptResponse
import com.puzzleplatform.player.data.model.ProfileResponse
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.PuzzleType
import com.puzzleplatform.player.data.model.SaveSnapshotResponse
import com.puzzleplatform.player.data.model.Snapshot
import com.puzzleplatform.player.data.model.SnapshotSummary
import com.puzzleplatform.player.data.model.SolvedQuestionsResponse
import com.puzzleplatform.player.data.sync.SyncClock
import com.puzzleplatform.player.data.sync.SyncManager
import com.puzzleplatform.player.data.sync.SyncWorker
import com.puzzleplatform.player.puzzle.PuzzleEngines
import com.puzzleplatform.player.puzzle.PuzzleThumbnail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.util.UUID

/**
 * Local-first data access. Reads resolve from Room whenever possible so screens
 * never block on an Aurora cold start; writes go to Room immediately (with a
 * client-generated UUID) and are pushed upstream in the background.
 *
 * For reference data that hasn't been downloaded for offline use, reads fall
 * through to the network and cache the result, so browsing still works online.
 * The public API is unchanged from the network-only version, so ViewModels are
 * unaffected.
 */
class PuzzleRepository(
    private val api: PuzzleApi,
    private val db: AppDatabase,
    private val sync: SyncManager,
    private val json: Json,
    private val context: Context,
) {
    // Session-lifetime memo of derived solved-picture thumbnails, keyed by
    // "puzzleId@updatedAt" so a server-side canonRepr edit invalidates. Bounded
    // implicitly by the number of solved picture-puzzles browsed this session.
    private val thumbnailCache = java.util.concurrent.ConcurrentHashMap<String, PuzzleThumbnail>()

    // --- Reads (local-first with network fallback for non-downloaded data) ---

    suspend fun listPuzzles(
        puzzleType: String? = null,
        srcCollection: String? = null,
        limit: Int? = null,
    ): List<Puzzle> {
        if (srcCollection != null && srcCollection != "none") {
            val collectionId = srcCollection.toIntOrNull()
            if (collectionId != null && isDownloaded(collectionId)) {
                return db.puzzleDao().listByCollection(collectionId).map { it.toModel(json) }
            }
        }
        // Not downloaded (or a general/type listing): fetch online, cache, and
        // fall back to whatever is local if the network is unavailable.
        return try {
            val puzzles = api.listPuzzles(puzzleType, srcCollection, limit).puzzles
            db.puzzleDao().upsertAll(puzzles.map { it.toEntity(json, updatedAt = null, deletedAt = null) })
            puzzles
        } catch (e: Exception) {
            val cid = srcCollection?.toIntOrNull()
            when {
                cid != null -> db.puzzleDao().listByCollection(cid).map { it.toModel(json) }
                limit != null -> db.puzzleDao().listRecent(limit).map { it.toModel(json) }
                else -> throw e
            }
        }
    }

    /**
     * The [limit] puzzles the player most recently worked on (by latest snapshot),
     * newest first. Progress is local-first, so this reads only from Room — an empty
     * list simply means nothing has been played yet.
     */
    suspend fun listRecentlyPlayed(limit: Int): List<Puzzle> =
        db.puzzleDao().listRecentlyPlayed(limit).map { it.toModel(json) }

    suspend fun getPuzzle(id: String): Puzzle {
        db.puzzleDao().getById(id)?.let { return it.toModel(json) }
        val puzzle = api.getPuzzle(id).puzzle
        db.puzzleDao().upsert(puzzle.toEntity(json, updatedAt = null, deletedAt = null))
        return puzzle
    }

    /**
     * Reference data already cached in Room, local-only (no network). Empty until the
     * first successful sync. Home reads these to paint immediately, so a cold backend
     * never blocks the first render; [listPuzzleTypes]/[listCollections] then refresh
     * from the network in the background.
     */
    suspend fun getCachedPuzzleTypes(): List<PuzzleType> =
        db.puzzleTypeDao().getAll().map { it.toModel() }

    suspend fun getCachedCollections(): List<Collection> =
        db.collectionDao().getAll().map { it.toModel() }

    suspend fun listPuzzleTypes(): List<PuzzleType> {
        return try {
            val types = api.listPuzzleTypes().puzzleTypes
            db.puzzleTypeDao().upsertAll(types.map { it.toEntity() })
            types
        } catch (e: Exception) {
            db.puzzleTypeDao().getAll().takeIf { it.isNotEmpty() }?.map { it.toModel() } ?: throw e
        }
    }

    suspend fun listCollections(): List<Collection> {
        return try {
            val collections = api.listCollections().collections
            db.collectionDao().upsertAll(collections.map { it.toEntity() })
            collections
        } catch (e: Exception) {
            db.collectionDao().getAll().takeIf { it.isNotEmpty() }?.map { it.toModel() } ?: throw e
        }
    }

    suspend fun listAttempts(question: String, finished: Boolean? = null): List<Attempt> =
        db.attemptDao().listByQuestion(question, finished).map { entity ->
            entity.toModel(db.snapshotDao().latestForAttempt(entity.id))
        }

    suspend fun getSolvedQuestions(questionIds: List<String>): SolvedQuestionsResponse {
        if (questionIds.isEmpty()) return SolvedQuestionsResponse()
        val solved = db.attemptDao().solvedQuestions(questionIds)
        val attempted = db.attemptDao().attemptedQuestions(questionIds).filter { it !in solved }
        return SolvedQuestionsResponse(solvedQuestions = solved, attemptedQuestions = attempted)
    }

    suspend fun getCollectionProgress(collectionIds: List<Int>): List<CollectionProgress> =
        collectionIds.map { cid ->
            val puzzles = db.puzzleDao().listByCollection(cid)
            val ids = puzzles.map { it.id }
            val solved = if (ids.isEmpty()) emptyList() else db.attemptDao().solvedQuestions(ids)
            CollectionProgress(collectionId = cid, total = puzzles.size, solved = solved.size)
        }

    suspend fun getAttemptSnapshot(attemptId: String): Snapshot =
        db.snapshotDao().latestForAttempt(attemptId)?.toModel()
            ?: throw NoSuchElementException("No snapshot found for attempt $attemptId")

    suspend fun listSnapshots(attemptId: String): List<SnapshotSummary> =
        db.snapshotDao().listForAttempt(attemptId).map { it.toSummary() }

    suspend fun getSnapshotById(attemptId: String, snapshotId: String): Snapshot =
        db.snapshotDao().getById(snapshotId)?.toModel()
            ?: throw NoSuchElementException("Snapshot $snapshotId not found")

    // --- Writes (local-first; pushed upstream in the background) ---

    /** Create an attempt locally with a client-generated id and its initial snapshot. */
    suspend fun createAttempt(question: String, initialAnswer: JsonObject): CreateAttemptResponse {
        val attemptId = UUID.randomUUID().toString()
        val snapshotId = UUID.randomUUID().toString()
        val now = SyncClock.nowDatetime()
        val puzzleUpdatedAt = db.puzzleDao().getById(question)?.updatedAt

        db.attemptDao().upsert(
            AttemptEntity(
                id = attemptId,
                question = question,
                createdAt = now,
                finishedAt = null,
                synced = false,
                puzzleUpdatedAt = puzzleUpdatedAt,
            )
        )
        db.snapshotDao().upsert(
            SnapshotEntity(
                id = snapshotId,
                attempt = attemptId,
                currentAnswer = json.encodeToString(JsonObject.serializer(), initialAnswer),
                progress = 0.0,
                elapsedSeconds = 0,
                finished = false,
                createdAt = now,
                synced = false,
            )
        )
        SyncWorker.enqueue(context)
        return CreateAttemptResponse(attemptId = attemptId, snapshotId = snapshotId)
    }

    /**
     * Append a snapshot locally. On completion, sets the attempt's finished_at
     * and pushes immediately so the server can confirm any newly-unlocked
     * achievements; otherwise a background push is enqueued.
     */
    suspend fun saveSnapshot(
        attemptId: String,
        currentAnswer: JsonObject,
        progress: Double,
        elapsedSeconds: Int,
        finished: Boolean? = null,
    ): SaveSnapshotResponse {
        val snapshotId = UUID.randomUUID().toString()
        val now = SyncClock.nowDatetime()
        val isFinished = finished == true

        db.snapshotDao().upsert(
            SnapshotEntity(
                id = snapshotId,
                attempt = attemptId,
                currentAnswer = json.encodeToString(JsonObject.serializer(), currentAnswer),
                progress = progress,
                elapsedSeconds = elapsedSeconds,
                finished = isFinished,
                createdAt = now,
                synced = false,
            )
        )
        if (isFinished) {
            db.attemptDao().setFinishedAt(attemptId, now)
            // Try to sync now so achievements come back; fall back to background.
            val achievements = try {
                sync.push()
            } catch (_: Exception) {
                SyncWorker.enqueue(context)
                emptyList()
            }
            return SaveSnapshotResponse(snapshotId = snapshotId, newAchievements = achievements)
        }
        SyncWorker.enqueue(context)
        return SaveSnapshotResponse(snapshotId = snapshotId)
    }

    /**
     * Solved-picture thumbnails for the given puzzles, for the collection view. Only
     * puzzles that are (a) locally finished and (b) of a picture-type whose engine
     * produces a thumbnail appear in the result; everything else is silently absent.
     *
     * Derivation (JSON parse + engine render, e.g. a Tentaishow flood-fill) runs off the
     * main thread and is memoized in [thumbnailCache], keyed by puzzle id + the puzzle's
     * updatedAt so a server-side canonRepr edit (which changes the derived picture)
     * invalidates the cached image. A finished answer is itself immutable, so nothing
     * else can stale the entry.
     */
    suspend fun getSolvedThumbnails(puzzleIds: List<String>): Map<String, PuzzleThumbnail> =
        withContext(Dispatchers.Default) {
            if (puzzleIds.isEmpty()) return@withContext emptyMap()
            val answers = db.snapshotDao().finishedAnswersByQuestion(puzzleIds).associateBy { it.question }
            buildMap {
                for (id in puzzleIds) {
                    val answer = answers[id] ?: continue
                    val puzzleEntity = db.puzzleDao().getById(id) ?: continue
                    val engine = PuzzleEngines.forType(puzzleEntity.puzzleType) ?: continue
                    val key = "$id@${puzzleEntity.updatedAt}"
                    val cached = thumbnailCache[key]
                    if (cached != null) {
                        put(id, cached)
                        continue
                    }
                    val parsed = try {
                        parseAnswer(answer.currentAnswer)
                    } catch (_: Exception) {
                        continue // corrupt saved answer; skip its thumbnail
                    }
                    // Engine has no picture for this type -> leave the row without one.
                    val rendered = engine.renderThumbnail(puzzleEntity.toModel(json), parsed) ?: continue
                    thumbnailCache[key] = rendered
                    put(id, rendered)
                }
            }
        }

    suspend fun getProfile(): ProfileResponse = api.getProfile(PLAYER_ID)

    /** Parse a snapshot's stringified currentAnswer into a JsonObject. */
    fun parseAnswer(currentAnswer: String): JsonObject =
        json.parseToJsonElement(currentAnswer) as JsonObject

    // --- Offline collection management (delegate to the sync engine) ---

    suspend fun downloadCollection(collectionId: Int) = sync.downloadCollection(collectionId)

    suspend fun refreshCollection(collectionId: Int) = sync.refreshCollection(collectionId)

    /**
     * Best-effort manifest refresh of every offline-downloaded collection, so
     * server-side puzzle edits/additions/deletions land locally. This is the only
     * path by which content edits reach an already-downloaded puzzle. A failure on
     * one collection is swallowed so the rest still refresh. Never touches progress.
     */
    suspend fun refreshDownloadedCollections() {
        for (id in db.collectionDownloadDao().getAll().map { it.collectionId }) {
            try {
                sync.refreshCollection(id)
            } catch (_: Exception) {
                // Offline or a transient server error; leave this collection as-is.
            }
        }
    }

    /**
     * True if the puzzle has been edited server-side since this attempt started
     * (local puzzle updatedAt is newer than the attempt's recorded version).
     * Drives the non-destructive "puzzle was updated" notice on the Play screen.
     */
    suspend fun isPuzzleEditedSinceAttempt(puzzleId: String, attemptId: String): Boolean {
        val attempt = db.attemptDao().getById(attemptId) ?: return false
        val puzzle = db.puzzleDao().getById(puzzleId) ?: return false
        val started = attempt.puzzleUpdatedAt
        val current = puzzle.updatedAt
        return started != null && current != null && current > started
    }

    /** Refresh the attempt's recorded puzzle version after an opt-in reload. */
    suspend fun currentPuzzleUpdatedAt(puzzleId: String): String? =
        db.puzzleDao().getById(puzzleId)?.updatedAt

    private suspend fun isDownloaded(collectionId: Int): Boolean =
        db.collectionDownloadDao().getById(collectionId) != null

    companion object {
        // No auth on the backend; the web client hardcodes player id = 1, so we match it.
        const val PLAYER_ID = 1
    }
}
