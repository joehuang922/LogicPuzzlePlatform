package com.puzzleplatform.player.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PuzzleTypeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(types: List<PuzzleTypeEntity>)

    @Query("SELECT * FROM puzzle_types ORDER BY name")
    suspend fun getAll(): List<PuzzleTypeEntity>
}

@Dao
interface CollectionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(collections: List<CollectionEntity>)

    @Query("SELECT * FROM collections ORDER BY id")
    suspend fun getAll(): List<CollectionEntity>
}

@Dao
interface PuzzleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(puzzles: List<PuzzleEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(puzzle: PuzzleEntity)

    @Query("SELECT * FROM puzzles WHERE id = :id")
    suspend fun getById(id: String): PuzzleEntity?

    // Listings hide soft-deleted puzzles (deletedAt set), matching the server.
    @Query("SELECT * FROM puzzles WHERE deletedAt IS NULL ORDER BY id LIMIT :limit")
    suspend fun listRecent(limit: Int): List<PuzzleEntity>

    @Query("SELECT * FROM puzzles WHERE srcCollection = :collectionId AND deletedAt IS NULL ORDER BY id")
    suspend fun listByCollection(collectionId: Int): List<PuzzleEntity>

    @Query("SELECT * FROM puzzles WHERE srcCollection = :collectionId")
    suspend fun listByCollectionIncludingDeleted(collectionId: Int): List<PuzzleEntity>

    @Query("UPDATE puzzles SET deletedAt = :deletedAt WHERE id = :id")
    suspend fun markDeleted(id: String, deletedAt: String)
}

@Dao
interface AttemptDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(attempt: AttemptEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(attempts: List<AttemptEntity>)

    @Query("SELECT * FROM attempts WHERE id = :id")
    suspend fun getById(id: String): AttemptEntity?

    // Newest first, matching the server's ORDER BY created_at DESC.
    @Query("SELECT * FROM attempts WHERE question = :question AND (:finished IS NULL OR (finishedAt IS NOT NULL) = :finished) ORDER BY createdAt DESC")
    suspend fun listByQuestion(question: String, finished: Boolean?): List<AttemptEntity>

    @Query("SELECT DISTINCT question FROM attempts WHERE finishedAt IS NOT NULL AND question IN (:ids)")
    suspend fun solvedQuestions(ids: List<String>): List<String>

    @Query("SELECT DISTINCT question FROM attempts WHERE finishedAt IS NULL AND question IN (:ids)")
    suspend fun attemptedQuestions(ids: List<String>): List<String>

    @Query("UPDATE attempts SET finishedAt = :finishedAt WHERE id = :id")
    suspend fun setFinishedAt(id: String, finishedAt: String)
}

@Dao
interface SnapshotDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(snapshot: SnapshotEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(snapshots: List<SnapshotEntity>)

    @Query("SELECT * FROM snapshots WHERE attempt = :attempt ORDER BY createdAt DESC LIMIT 1")
    suspend fun latestForAttempt(attempt: String): SnapshotEntity?

    @Query("SELECT * FROM snapshots WHERE attempt = :attempt ORDER BY createdAt DESC")
    suspend fun listForAttempt(attempt: String): List<SnapshotEntity>

    @Query("SELECT * FROM snapshots WHERE id = :id")
    suspend fun getById(id: String): SnapshotEntity?
}

/** Queries for the sync engine and the Profile sync-status indicator. */
@Dao
interface SyncDao {
    @Query("SELECT * FROM attempts WHERE synced = 0")
    suspend fun unsyncedAttempts(): List<AttemptEntity>

    @Query("SELECT * FROM snapshots WHERE synced = 0 ORDER BY createdAt")
    suspend fun unsyncedSnapshots(): List<SnapshotEntity>

    @Query("UPDATE attempts SET synced = 1 WHERE id IN (:ids)")
    suspend fun markAttemptsSynced(ids: List<String>)

    @Query("UPDATE snapshots SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSnapshotsSynced(ids: List<String>)

    // Live count of everything not yet pushed — drives the Profile status row.
    @Query("SELECT (SELECT COUNT(*) FROM attempts WHERE synced = 0) + (SELECT COUNT(*) FROM snapshots WHERE synced = 0)")
    fun pendingCount(): Flow<Int>
}

@Dao
interface CollectionDownloadDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(download: CollectionDownloadEntity)

    @Query("SELECT * FROM collection_downloads")
    suspend fun getAll(): List<CollectionDownloadEntity>

    @Query("SELECT collectionId FROM collection_downloads")
    fun downloadedCollectionIds(): Flow<List<Int>>

    @Query("SELECT * FROM collection_downloads WHERE collectionId = :id")
    suspend fun getById(id: Int): CollectionDownloadEntity?
}
