package com.puzzleplatform.player.data.sync

import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.local.AppDatabase
import com.puzzleplatform.player.data.local.toEntity
import com.puzzleplatform.player.data.model.AchievementUnlock
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
 *    reference data for offline play, detecting edits/additions/deletions, and
 *    pull server-side progress (attempts/snapshots) so work done on another
 *    device lands here. The progress merge is union-by-UUID, so local unsynced
 *    progress is never clobbered.
 *
 * [player] mirrors the web client's hardcoded id (no auth on the backend).
 */
class SyncManager(
    private val api: PuzzleApi,
    private val db: AppDatabase,
    private val json: Json,
    private val player: Int,
) {
    private val scope = CoroutineScope(SupervisorJob())
    private val pushMutex = Mutex()

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

        // Pull existing server-side progress for these puzzles.
        pullProgressFor(puzzles.map { it.id })

        db.collectionDownloadDao().upsert(
            com.puzzleplatform.player.data.local.CollectionDownloadEntity(
                collectionId = collectionId,
                downloadedAt = SyncClock.nowMillis(),
                lastManifestSyncAt = SyncClock.nowMillis(),
            )
        )
    }

    /**
     * Pull server-side progress for the given puzzles and merge it locally. This
     * is how an attempt made on another device reaches this one. The merge is
     * additive (union-by-UUID): server rows are stored, but a locally-present row
     * (which may hold unsynced progress) is never overwritten, so pulling can
     * only add, never lose, local work. Best-effort per attempt — a failed fetch
     * leaves that attempt untouched. Marked synced, since it came from the server.
     */
    private suspend fun pullProgressFor(questionIds: List<String>) {
        for (questionId in questionIds) {
            val serverAttempts = try {
                api.listAttempts(player, questionId, finished = null).attempts +
                    api.listAttempts(player, questionId, finished = true).attempts
            } catch (_: Exception) {
                continue // offline/cold-start for this puzzle; skip it
            }
            for (attempt in serverAttempts.distinctBy { it.id }) {
                importServerAttempt(attempt.id, questionId)
            }
        }
    }

    /**
     * Fetch one server attempt's snapshots and merge them in (as synced). Only
     * snapshots not already present locally are inserted (union-by-UUID), so a
     * device's own unsynced snapshots are preserved. The attempt row is inserted
     * only when absent locally; an existing local row keeps its own state (which
     * may be ahead of the server and not yet pushed), except that a server-side
     * finish is applied if the local row isn't finished yet.
     */
    private suspend fun importServerAttempt(attemptId: String, question: String) {
        val snapshots = try {
            api.listSnapshots(attemptId).snapshots
        } catch (_: Exception) {
            emptyList()
        }
        val existingSnapshotIds = db.snapshotDao().listForAttempt(attemptId).map { it.id }.toSet()
        var finishedAt: String? = null
        val snapEntities = snapshots.mapNotNull { summary ->
            if (summary.id in existingSnapshotIds) return@mapNotNull null // already have it
            val full = try {
                api.getSnapshotById(attemptId, summary.id).snapshot
            } catch (_: Exception) {
                return@mapNotNull null
            }
            if (full.finished) finishedAt = full.createdAt
            com.puzzleplatform.player.data.local.SnapshotEntity(
                id = full.id,
                attempt = attemptId,
                currentAnswer = full.currentAnswer,
                progress = full.progress,
                elapsedSeconds = full.elapsedSeconds,
                finished = full.finished,
                createdAt = full.createdAt,
                synced = true,
            )
        }
        if (snapEntities.isNotEmpty()) db.snapshotDao().upsertAll(snapEntities)

        val existingAttempt = db.attemptDao().getById(attemptId)
        if (existingAttempt == null) {
            db.attemptDao().upsert(
                com.puzzleplatform.player.data.local.AttemptEntity(
                    id = attemptId,
                    question = question,
                    createdAt = snapEntities.minByOrNull { it.createdAt }?.createdAt ?: SyncClock.nowDatetime(),
                    finishedAt = finishedAt,
                    synced = true,
                    puzzleUpdatedAt = db.puzzleDao().getById(question)?.updatedAt,
                )
            )
        } else if (existingAttempt.finishedAt == null && finishedAt != null) {
            // Server saw this attempt finished (e.g. completed on another device)
            // but our local row isn't finished yet — adopt the completion time.
            db.attemptDao().setFinishedAt(attemptId, finishedAt!!)
        }
    }

    /**
     * Reference-data refresh via the collection manifest. Detects, non-destructively:
     *  - added puzzles (in manifest, not local) -> download + insert.
     *  - edited puzzles (server updatedAt newer) -> re-fetch canon_repr, replace.
     *  - deleted puzzles (deletedAt set) -> mark local row deleted (kept, hidden).
     *
     * Then pulls server-side progress for the collection's puzzles so attempts
     * made on another device land here. The progress merge is additive
     * (union-by-UUID), so local unsynced progress is never clobbered.
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

        // Pull cross-device progress for this collection's (live) puzzles.
        pullProgressFor(db.puzzleDao().listByCollection(collectionId).map { it.id })

        db.collectionDownloadDao().getById(collectionId)?.let {
            db.collectionDownloadDao().upsert(it.copy(lastManifestSyncAt = SyncClock.nowMillis()))
        }
    }
}
