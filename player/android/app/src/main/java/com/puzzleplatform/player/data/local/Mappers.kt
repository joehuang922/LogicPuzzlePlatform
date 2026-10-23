package com.puzzleplatform.player.data.local

import com.puzzleplatform.player.data.model.Attempt
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.PuzzleType
import com.puzzleplatform.player.data.model.Snapshot
import com.puzzleplatform.player.data.model.SnapshotSummary
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Conversions between the wire DTOs (data.model) and Room entities (data.local).
 * canonRepr / currentAnswer are kept as raw JSON strings on both sides.
 */

fun PuzzleType.toEntity() = PuzzleTypeEntity(id, name, jpLabel, rule)

fun PuzzleTypeEntity.toModel() = PuzzleType(id, name, jpLabel, rule)

fun Collection.toEntity() =
    CollectionEntity(id, name, publisher, publishAt, coverSrc, puzzleCount)

fun CollectionEntity.toModel() =
    Collection(id, name, publisher, publishAt, coverSrc, puzzleCount)

fun Puzzle.toEntity(json: Json, updatedAt: String?, deletedAt: String?) = PuzzleEntity(
    id = id,
    puzzleType = puzzleType,
    puzzleTypeName = puzzleTypeName,
    puzzleTypeJpLabel = puzzleTypeJpLabel,
    title = title,
    author = author,
    difficulty = difficulty,
    width = width,
    height = height,
    canonRepr = json.encodeToString(JsonObject.serializer(), canonRepr),
    srcCollection = srcCollection,
    srcCollectionName = srcCollectionName,
    srcCollectionCoverSrc = srcCollectionCoverSrc,
    special = special,
    solutionRepr = solutionRepr?.let { json.encodeToString(JsonObject.serializer(), it) },
    updatedAt = updatedAt,
    deletedAt = deletedAt,
)

/**
 * A just-created question as a local row, for the write-through when the server's
 * copy can't be read back. Labels come from the cached [type] / [collection] rows
 * (blank / null when not cached); there's no stored solution, so offline "reveal"
 * waits for the next sync. Null updatedAt, so a manifest refresh re-fetches it.
 */
fun CreatePuzzleRequest.toLocalEntity(
    id: String,
    json: Json,
    type: PuzzleTypeEntity?,
    collection: CollectionEntity?,
) = PuzzleEntity(
    id = id,
    puzzleType = puzzleType,
    puzzleTypeName = type?.name ?: "",
    puzzleTypeJpLabel = type?.jpLabel ?: "",
    title = title,
    author = author,
    difficulty = difficulty,
    width = width,
    height = height,
    canonRepr = json.encodeToString(JsonObject.serializer(), canonRepr),
    srcCollection = srcCollection,
    srcCollectionName = collection?.name,
    srcCollectionCoverSrc = collection?.coverSrc,
    special = special ?: false,
    solutionRepr = null,
    updatedAt = null,
    deletedAt = null,
)

fun PuzzleEntity.toModel(json: Json) = Puzzle(
    id = id,
    puzzleType = puzzleType,
    puzzleTypeName = puzzleTypeName,
    puzzleTypeJpLabel = puzzleTypeJpLabel,
    title = title,
    author = author,
    difficulty = difficulty,
    width = width,
    height = height,
    canonRepr = json.parseToJsonElement(canonRepr) as JsonObject,
    srcCollection = srcCollection,
    srcCollectionName = srcCollectionName,
    srcCollectionCoverSrc = srcCollectionCoverSrc,
    special = special,
    solutionRepr = solutionRepr?.let { json.parseToJsonElement(it) as JsonObject },
)

fun SnapshotEntity.toModel() = Snapshot(
    id = id,
    attempt = attempt,
    currentAnswer = currentAnswer,
    progress = progress,
    elapsedSeconds = elapsedSeconds,
    finished = finished,
    createdAt = createdAt,
)

fun SnapshotEntity.toSummary() =
    SnapshotSummary(id = id, progress = progress, elapsedSeconds = elapsedSeconds, createdAt = createdAt)

/** An Attempt DTO carries the latest snapshot's progress/elapsed for the list UI. */
fun AttemptEntity.toModel(latest: SnapshotEntity?) = Attempt(
    id = id,
    createdAt = createdAt,
    latestProgress = latest?.progress ?: 0.0,
    latestElapsedSeconds = latest?.elapsedSeconds ?: 0,
)
