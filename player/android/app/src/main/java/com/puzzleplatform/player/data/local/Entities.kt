package com.puzzleplatform.player.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entities mirroring the relevant remote tables (player/api/schema.sql).
 *
 * Two categories:
 *  - Reference data (types, collections, puzzles) is server-authoritative and
 *    read-only on the device. It's replaced wholesale on prefetch/refresh.
 *  - Progress (attempts, snapshots) is created locally and pushed upstream.
 *    Rows carry a [synced] flag; append-only + UUID-keyed makes sync idempotent.
 */

@Entity(tableName = "puzzle_types")
data class PuzzleTypeEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val jpLabel: String,
    val rule: String,
)

@Entity(tableName = "collections")
data class CollectionEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val publisher: String?,
    val publishAt: String?,
    val coverSrc: String?,
    val puzzleCount: Int,
)

@Entity(
    tableName = "puzzles",
    indices = [Index("srcCollection")],
)
data class PuzzleEntity(
    @PrimaryKey val id: String,
    val puzzleType: Int,
    val puzzleTypeName: String,
    val puzzleTypeJpLabel: String,
    val title: String?,
    val author: String?,
    val difficulty: Int,
    val width: Int?,
    val height: Int?,
    // Stored as the raw JSON string, exactly as it arrives over the wire.
    val canonRepr: String,
    val srcCollection: Int?,
    val srcCollectionName: String?,
    val srcCollectionCoverSrc: String?,
    val special: Boolean,
    // Auto-solve stored solution (docs/auto-solve), raw JSON string or null. Kept so the
    // offline hinter's "reveal" fallback works without a network round-trip.
    val solutionRepr: String?,
    // Change-detection fields diffed against the server manifest.
    val updatedAt: String?,
    // Non-null => soft-deleted server-side; hidden from listings but kept so an
    // unsynced attempt on it can still resolve and push.
    val deletedAt: String?,
)

@Entity(
    tableName = "attempts",
    indices = [Index("question"), Index("synced")],
)
data class AttemptEntity(
    @PrimaryKey val id: String,
    val question: String,
    val createdAt: String,
    val finishedAt: String?,
    // false => created locally and not yet pushed upstream.
    val synced: Boolean,
    // The puzzle's updatedAt when this attempt was started. If the puzzle is
    // later edited (server updatedAt newer), we surface the edited-puzzle notice.
    val puzzleUpdatedAt: String?,
)

@Entity(
    tableName = "snapshots",
    indices = [Index("attempt"), Index("synced")],
)
data class SnapshotEntity(
    @PrimaryKey val id: String,
    val attempt: String,
    // Stored stringified, matching the server column and the Snapshot DTO.
    val currentAnswer: String,
    val progress: Double,
    val elapsedSeconds: Int,
    val finished: Boolean,
    val createdAt: String,
    // false => created locally and not yet pushed upstream.
    val synced: Boolean,
)

/** Tracks which collections have been downloaded for offline play. */
@Entity(tableName = "collection_downloads")
data class CollectionDownloadEntity(
    @PrimaryKey val collectionId: Int,
    val downloadedAt: Long,
    val lastManifestSyncAt: Long?,
)
