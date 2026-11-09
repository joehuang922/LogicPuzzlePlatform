package com.puzzleplatform.player.data.sync

import android.content.SharedPreferences
import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.local.AttemptEntity
import com.puzzleplatform.player.data.local.SnapshotEntity
import com.puzzleplatform.player.data.local.AppDatabase
import com.puzzleplatform.player.data.local.toEntity
import com.puzzleplatform.player.data.model.AchievementUnlock
import com.puzzleplatform.player.data.model.ChangedAttempt
import com.puzzleplatform.player.data.model.Snapshot
import com.puzzleplatform.player.data.model.SyncAttemptInput
import com.puzzleplatform.player.data.model.SyncRequest
import com.puzzleplatform.player.data.model.SyncSnapshotInput
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** Snapshot of local↔remote sync state for the Profile status indicator. */
data class SyncState(
    val pendingCount: Int = 0,
    val syncing: Boolean = false,
    val lastSyncedAt: Long? = null,
)

/**
 * Owns both directions of offline sync:
 *  - push(): replay locally-created attempts/snapshots upstream via POST /sync.
 *    Idempotent by client UUID, so retries and duplicate runs are safe.
 *  - downloadCollection()/refreshCollection(): pull server-authoritative
 *    reference data for offline play, detecting edits/additions/deletions.
 *  - pullProgress(): pull every attempt/snapshot changed since the last pull
 *    (GET /sync, cursor-based) so work done on another device lands here. The
 *    merge is union-by-UUID, so local unsynced progress is never clobbered.
 *
 * [player] mirrors the web client's hardcoded id (no auth on the backend).
 */
class SyncManager(
    private val api: PuzzleApi,
    private val db: AppDatabase,
    private val json: Json,
    private val player: Int,
    private val cursorStore: SharedPreferences,
) {
    private val scope = CoroutineScope(SupervisorJob())
    private val pushMutex = Mutex()
    private val pullMutex = Mutex()

    private val _syncing = MutableStateFlow(false)
    private val _lastSyncedAt = MutableStateFlow<Long?>(null)

    /** Live sync status: pending write count + whether a push is in flight. */
    val syncState: StateFlow<SyncState> =
        combine(db.syncDao().pendingCount(), _syncing, _lastSyncedAt) { pending, syncing, lastSynced ->
            SyncState(pendingCount = pending, syncing = syncing, lastSyncedAt = lastSynced)
        }.stateIn(scope, SharingStarted.Eagerly, SyncState())

    val downloadedCollectionIds: Flow<List<Int>> = db.collectionDownloadDao().downloadedCollectionIds()

    /**
     * Push every unsynced attempt+snapshot in one batch. Returns achievements the
     * server confirmed as newly unlocked. No-op (empty) when nothing is pending.
     * Serialized by a mutex so overlapping triggers don't double-send.
     */
    suspend fun push(): List<AchievementUnlock> = pushMutex.withLock {
        val sync = db.syncDao()
        val attempts = sync.unsyncedAttempts()
        val snapshots = sync.unsyncedSnapshots()
        if (attempts.isEmpty() && snapshots.isEmpty()) return emptyList()

        _syncing.value = true
        try {
            val byAttempt = snapshots.groupBy { it.attempt }
            // Include attempts that only have unsynced snapshots (attempt already synced).
            val attemptIds = (attempts.map { it.id } + byAttempt.keys).toSet()
            val attemptById = attempts.associateBy { it.id }

            val payload = attemptIds.mapNotNull { attemptId ->
                val attempt = attemptById[attemptId]
                    ?: db.attemptDao().getById(attemptId)
                    ?: return@mapNotNull null
                SyncAttemptInput(
                    id = attempt.id,
                    question = attempt.question,
                    createdAt = attempt.createdAt,
                    snapshots = (byAttempt[attemptId] ?: emptyList()).map { s ->
                        SyncSnapshotInput(
                            id = s.id,
                            currentAnswer = json.parseToJsonElement(s.currentAnswer) as JsonObject,
                            progress = s.progress,
                            elapsedSeconds = s.elapsedSeconds,
                            finished = s.finished,
                            createdAt = s.createdAt,
                        )
                    },
                )
            }

            val response = api.sync(SyncRequest(player = player, attempts = payload))

            if (response.syncedAttemptIds.isNotEmpty()) {
                sync.markAttemptsSynced(response.syncedAttemptIds)
            }
            if (response.syncedSnapshotIds.isNotEmpty()) {
                sync.markSnapshotsSynced(response.syncedSnapshotIds)
            }
            _lastSyncedAt.value = SyncClock.nowMillis()
            return response.newAchievements
        } finally {
            _syncing.value = false
        }
    }

    /**
     * Initial prefetch of a collection for offline play: pulls reference data
     * (types, the collection row, its puzzles) plus any existing attempts and
     * their snapshots (marked synced, since they came from the server).
     */
    suspend fun downloadCollection(collectionId: Int) {
        // Refresh the shared lookup tables so puzzles resolve their type labels.
        db.puzzleTypeDao().upsertAll(api.listPuzzleTypes().puzzleTypes.map { it.toEntity() })
        db.collectionDao().upsertAll(api.listCollections().collections.map { it.toEntity() })

        val puzzles = api.listPuzzles(srcCollection = collectionId.toString()).puzzles
        val puzzleEntities = puzzles.map { it.toEntity(json, updatedAt = null, deletedAt = null) }
        db.puzzleDao().upsertAll(puzzleEntities)

        // Progress for every puzzle (these included) arrives through the
        // incremental pull; usually a no-op or a few rows. Best-effort, as
        // before: a failed pull leaves the cursor, so the next one retries.
        try {
            pullProgress()
        } catch (_: Exception) {
        }

        db.collectionDownloadDao().upsert(
            com.puzzleplatform.player.data.local.CollectionDownloadEntity(
                collectionId = collectionId,
                downloadedAt = SyncClock.nowMillis(),
                lastManifestSyncAt = SyncClock.nowMillis(),
            )
        )
    }

    /**
     * Pull every progress change made on any device since the last pull, for all
     * puzzles, via GET /sync: one request per page (300 snapshots) instead of
     * several per puzzle. This is how an attempt made on another device reaches
     * this one.
     *
     * The merge is additive (union-by-UUID): a server attempt or snapshot is
     * inserted only if absent locally, so a local row, which may hold unsynced
     * progress, is never overwritten. The one exception is a server-side finish,
     * adopted when the local attempt isn't finished yet. Attempts are stored even
     * for puzzles not downloaded here, so downloading a collection later needs
     * no progress fetch of its own.
     *
     * The cursor ([PROGRESS_CURSOR]) advances only after every page is merged,
     * so an interrupted pull is repeated next time; re-delivered rows are no-ops.
     */
    suspend fun pullProgress() = pullMutex.withLock {
        val since = cursorStore.getString(PROGRESS_CURSOR, null)
        var page = api.pullChanges(player, since = since)
        val until = page.until
        mergeAttempts(page.attempts)
        while (true) {
            mergeSnapshots(page.snapshots)
            val next = page.next ?: break
            page = api.pullChanges(player, since = since, until = until, after = next)
        }
        cursorStore.edit().putString(PROGRESS_CURSOR, until).apply()
    }

    private suspend fun mergeAttempts(attempts: List<ChangedAttempt>) {
        val attemptDao = db.attemptDao()
        for (server in attempts) {
            val local = attemptDao.getById(server.id)
            if (local == null) {
                attemptDao.upsert(
                    AttemptEntity(
                        id = server.id,
                        question = server.question,
                        createdAt = server.createdAt,
                        finishedAt = server.finishedAt,
                        synced = true,
                        puzzleUpdatedAt = db.puzzleDao().getById(server.question)?.updatedAt,
                    )
                )
            } else if (local.finishedAt == null && server.finishedAt != null) {
                // Finished on another device: adopt the server's completion time.
                attemptDao.setFinishedAt(server.id, server.finishedAt)
            }
        }
    }

    private suspend fun mergeSnapshots(snapshots: List<Snapshot>) {
        val snapshotDao = db.snapshotDao()
        val fresh = snapshots.filter { snapshotDao.getById(it.id) == null }
        if (fresh.isEmpty()) return
        snapshotDao.upsertAll(
            fresh.map { s ->
                SnapshotEntity(
                    id = s.id,
                    attempt = s.attempt,
                    currentAnswer = s.currentAnswer,
                    progress = s.progress,
                    elapsedSeconds = s.elapsedSeconds,
                    finished = s.finished,
                    createdAt = s.createdAt,
                    synced = true,
                )
            }
        )
    }

    /**
     * Reference-data refresh via the collection manifest. Detects, non-destructively:
     *  - added puzzles (in manifest, not local) -> download + insert.
     *  - edited puzzles (server updatedAt newer) -> re-fetch canon_repr, replace.
     *  - deleted puzzles (deletedAt set) -> mark local row deleted (kept, hidden).
     *
     * Progress is not pulled here: [pullProgress] covers every puzzle at once.
     */
    suspend fun refreshCollection(collectionId: Int) {
        val manifest = api.getCollectionManifest(collectionId).puzzles
        val local = db.puzzleDao().listByCollectionIncludingDeleted(collectionId).associateBy { it.id }

        for (entry in manifest) {
            val existing = local[entry.id]
            when {
                entry.deletedAt != null -> {
                    if (existing != null && existing.deletedAt == null) {
                        db.puzzleDao().markDeleted(entry.id, entry.deletedAt)
                    }
                }
                existing == null -> {
                    // New puzzle in this collection: fetch full content.
                    val puzzle = api.getPuzzle(entry.id).puzzle
                    db.puzzleDao().upsert(puzzle.toEntity(json, entry.updatedAt, entry.deletedAt))
                }
                entry.updatedAt != null && entry.updatedAt != existing.updatedAt -> {
                    // Edited puzzle: replace content but keep the same row/id. Any
                    // in-progress attempt keeps its own puzzleUpdatedAt, so the
                    // Play screen can detect the drift and offer an opt-in reload.
                    val puzzle = api.getPuzzle(entry.id).puzzle
                    db.puzzleDao().upsert(puzzle.toEntity(json, entry.updatedAt, entry.deletedAt))
                }
            }
        }


        db.collectionDownloadDao().getById(collectionId)?.let {
            db.collectionDownloadDao().upsert(it.copy(lastManifestSyncAt = SyncClock.nowMillis()))
        }
    }

    private companion object {
        /** The server `until` of the last complete pull: the next pull's `since`. */
        const val PROGRESS_CURSOR = "progressCursor"
    }
}
